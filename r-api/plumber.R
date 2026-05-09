# DIGIVET R Plumber API
# Runs alongside the Node.js server and exposes analytics endpoints.
# Start with: source("r-api/run.R")  OR  Rscript r-api/run.R

library(plumber)
library(DBI)
library(RPostgres)
library(cluster)

# ── DB connection helper ────────────────────────────────────────
db_connect <- function() {
  dbConnect(
    RPostgres::Postgres(),
    host     = Sys.getenv("PGHOST",     "localhost"),
    port     = as.integer(Sys.getenv("PGPORT",     "5432")),
    dbname   = Sys.getenv("PGDATABASE", "DIGIVETDB"),
    user     = Sys.getenv("PGUSER",     "postgres"),
    password = Sys.getenv("PGPASSWORD", "")
  )
}

# ── CORS header for all responses ──────────────────────────────
#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin",  "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req$REQUEST_METHOD == "OPTIONS") {
    res$status <- 200
    return(list())
  }
  plumber::forward()
}

# ── Health check — no DB needed ─────────────────────────────────
#* @get /ping
#* @serializer unboxedJSON
function() {
  list(
    status  = "ok",
    engine  = "R Plumber",
    version = as.character(packageVersion("plumber"))
  )
}

# ── Vaccination coverage by barangay ───────────────────────────
#* @get /barangay-coverage
#* @serializer unboxedJSON
#* @param q   Search string (optional)
#* @param limit Max rows returned (default 50)
function(req, res, q = "", limit = "50") {
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    df <- dbGetQuery(con, "
      SELECT
        b.barangay_name,
        COUNT(DISTINCT v.vaccine_id)::int                              AS vaccination_count,
        COUNT(DISTINCT p.pet_id)::int                                  AS total_pets,
        COUNT(DISTINCT CASE WHEN v.vaccine_id IS NOT NULL
                            THEN p.pet_id END)::int                    AS vaccinated_pets
      FROM barangay_table b
      LEFT JOIN owner_table   o ON o.barangay_id = b.barangay_id
      LEFT JOIN pet_table     p ON p.owner_id     = o.owner_id
      LEFT JOIN vaccine_table v ON v.pet_id       = p.pet_id
      GROUP BY b.barangay_id, b.barangay_name
      ORDER BY vaccination_count DESC
    ")

    # Coverage = pets with at least one vaccination / total registered pets
    df$coverage_rate <- round(
      df$vaccinated_pets / pmax(df$total_pets, 1) * 100, 1
    )

    if (nchar(trimws(q)) > 0) {
      df <- df[grepl(q, df$barangay_name, ignore.case = TRUE), ]
    }

    n   <- min(as.integer(limit), nrow(df))
    df  <- df[seq_len(n), ]

    list(status = "ok", total = nrow(df), data = df)
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

# ── K-Means clustering — Barangay risk classification ──────────
#* @get /clustering
#* @serializer unboxedJSON
function(req, res) {
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    df <- dbGetQuery(con, "
      SELECT
        b.barangay_id,
        b.barangay_name,
        COUNT(DISTINCT p.pet_id)::int                                        AS total_pets,
        COUNT(DISTINCT CASE WHEN v.vaccine_id IS NOT NULL
                            THEN p.pet_id END)::int                          AS vaccinated_pets
      FROM barangay_table b
      LEFT JOIN owner_table   o ON o.barangay_id = b.barangay_id
      LEFT JOIN pet_table     p ON p.owner_id     = o.owner_id
      LEFT JOIN vaccine_table v ON v.pet_id       = p.pet_id
      GROUP BY b.barangay_id, b.barangay_name
      HAVING COUNT(DISTINCT p.pet_id) > 0
      ORDER BY b.barangay_name
    ")

    if (nrow(df) < 3) {
      return(list(
        status  = "insufficient_data",
        message = "Need at least 3 barangays with registered pets to run clustering."
      ))
    }

    df$coverage_rate <- round(df$vaccinated_pets / pmax(df$total_pets, 1) * 100, 1)
    df$missed        <- df$total_pets - df$vaccinated_pets

    # Scale features: coverage rate, total pets, missed pets
    features <- scale(df[, c("coverage_rate", "total_pets", "missed")])

    # K-Means (k=3, multiple restarts for stability)
    set.seed(42)
    km <- kmeans(features, centers = 3, nstart = 25, iter.max = 100)
    df$cluster <- km$cluster

    # Silhouette score — how well-separated the clusters are
    sil_obj         <- silhouette(km$cluster, dist(features))
    silhouette_score <- round(mean(sil_obj[, 3]), 2)

    # Label clusters by mean coverage (lowest = HIGH RISK, highest = HEALTHY)
    means  <- tapply(df$coverage_rate, df$cluster, mean)
    ranked <- order(means)              # index 1 = lowest coverage
    labels <- character(3)
    labels[ranked[1]] <- "HIGH RISK"
    labels[ranked[2]] <- "MODERATE RISK"
    labels[ranked[3]] <- "HEALTHY"
    df$cluster_label <- labels[df$cluster]

    # Compute coverage thresholds per cluster
    summary_df <- do.call(rbind, lapply(c("HIGH RISK", "MODERATE RISK", "HEALTHY"), function(lbl) {
      sub <- df[df$cluster_label == lbl, ]
      data.frame(
        cluster      = lbl,
        count        = nrow(sub),
        avg_coverage = round(mean(sub$coverage_rate), 1),
        min_coverage = round(min(sub$coverage_rate), 1),
        max_coverage = round(max(sub$coverage_rate), 1)
      )
    }))

    # Sort barangays: HIGH RISK first (lowest coverage), then MODERATE, then HEALTHY
    order_map <- c("HIGH RISK" = 1, "MODERATE RISK" = 2, "HEALTHY" = 3)
    df$sort_order <- order_map[df$cluster_label]
    df <- df[order(df$sort_order, df$coverage_rate), ]

    list(
      status           = "ok",
      silhouette_score = silhouette_score,
      k                = 3,
      n_barangays      = nrow(df),
      method           = "K-Means (k=3) · features: Coverage Rate, Total Pets, Missed Pets",
      cluster_summary  = summary_df,
      barangays        = df[, c("barangay_name", "cluster_label", "coverage_rate",
                                "total_pets", "vaccinated_pets", "missed")]
    )
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

# ── Pet type breakdown ─────────────────────────────────────────
#* @get /pet-type-breakdown
#* @serializer unboxedJSON
function(req, res) {
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    df <- dbGetQuery(con, "
      SELECT
        p.pet_type,
        COUNT(DISTINCT p.pet_id)::int        AS pet_count,
        COUNT(DISTINCT v.vaccine_id)::int    AS vaccination_count
      FROM pet_table p
      LEFT JOIN vaccine_table v ON v.pet_id = p.pet_id
      GROUP BY p.pet_type
      ORDER BY pet_count DESC
    ")

    total_pets <- sum(df$pet_count)
    df$pct <- round(df$pet_count / pmax(total_pets, 1) * 100, 1)

    list(status = "ok", total_pets = total_pets, data = df)
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

#* @get /pet-type-detail
#* @serializer unboxedJSON
#* @param type Pet type string
function(req, res, type = "") {
  if (nchar(trimws(type)) == 0) {
    res$status <- 400
    return(list(status = "error", message = "type parameter required"))
  }
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    df <- dbGetQuery(con, sprintf("
      SELECT
        p.pet_name,
        p.pet_age,
        p.pet_color,
        o.owner_name,
        b.barangay_name,
        COUNT(DISTINCT v.vaccine_id)::int AS vaccination_count,
        MAX(v.vaccine_date)               AS last_vaccinated
      FROM pet_table p
      JOIN owner_table    o ON o.owner_id    = p.owner_id
      LEFT JOIN barangay_table b ON b.barangay_id = o.barangay_id
      LEFT JOIN vaccine_table v ON v.pet_id = p.pet_id
      WHERE LOWER(p.pet_type) = LOWER('%s')
      GROUP BY p.pet_id, p.pet_name, p.pet_age, p.pet_color,
               o.owner_name, b.barangay_name
      ORDER BY vaccination_count DESC, p.pet_name
      LIMIT 50
    ", type))

    list(status = "ok", type = type, count = nrow(df), data = df)
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

# ── Monthly vaccination trends ─────────────────────────────────
#* @get /monthly-trends
#* @serializer unboxedJSON
#* @param months How many months back to include (default 12)
function(req, res, months = "12") {
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    df <- dbGetQuery(con, sprintf("
      SELECT
        TO_CHAR(vaccine_date, 'YYYY-MM')  AS year_month,
        TO_CHAR(vaccine_date, 'Mon YYYY') AS label,
        COUNT(*)::int                     AS vaccination_count
      FROM vaccine_table
      WHERE vaccine_date >= CURRENT_DATE - INTERVAL '%d months'
      GROUP BY year_month, label
      ORDER BY year_month ASC
    ", as.integer(months)))

    list(status = "ok", months = nrow(df), data = df)
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

# ── Monthly detail (click a bar to drill down) ─────────────────
#* @get /monthly-detail
#* @serializer unboxedJSON
#* @param month YYYY-MM string
function(req, res, month = "") {
  if (nchar(trimws(month)) == 0) {
    res$status <- 400
    return(list(status = "error", message = "month parameter required (YYYY-MM)"))
  }
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    by_vaccine <- dbGetQuery(con, sprintf("
      SELECT vaccine_details AS label, COUNT(*)::int AS count
      FROM vaccine_table
      WHERE TO_CHAR(vaccine_date, 'YYYY-MM') = '%s'
      GROUP BY vaccine_details
      ORDER BY count DESC
      LIMIT 8
    ", month))

    by_barangay <- dbGetQuery(con, sprintf("
      SELECT b.barangay_name AS label, COUNT(*)::int AS count
      FROM vaccine_table v
      JOIN pet_table     p ON p.pet_id      = v.pet_id
      JOIN owner_table   o ON o.owner_id    = p.owner_id
      JOIN barangay_table b ON b.barangay_id = o.barangay_id
      WHERE TO_CHAR(v.vaccine_date, 'YYYY-MM') = '%s'
      GROUP BY b.barangay_id, b.barangay_name
      ORDER BY count DESC
      LIMIT 6
    ", month))

    entries <- dbGetQuery(con, sprintf("
      SELECT TO_CHAR(v.vaccine_date, 'Mon DD') AS date_label,
             p.pet_name, p.pet_type,
             o.owner_name,
             v.vaccine_details,
             vt.vet_name,
             a.approval_code
      FROM vaccine_table v
      JOIN pet_table          p  ON p.pet_id      = v.pet_id
      JOIN owner_table        o  ON o.owner_id    = p.owner_id
      LEFT JOIN vet_table     vt ON vt.vet_id     = v.vet_id
      LEFT JOIN approval_id_table a ON a.approval_id = v.approval_id
      WHERE TO_CHAR(v.vaccine_date, 'YYYY-MM') = '%s'
      ORDER BY v.vaccine_date DESC
      LIMIT 12
    ", month))

    list(
      status      = "ok",
      month       = month,
      total       = sum(by_vaccine$count),
      by_vaccine  = by_vaccine,
      by_barangay = by_barangay,
      entries     = entries
    )
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}

# ── DB connection test ──────────────────────────────────────────
#* @get /test-db
#* @serializer unboxedJSON
function(res) {
  tryCatch({
    con <- db_connect()
    on.exit(dbDisconnect(con))

    total_vax   <- dbGetQuery(con, "SELECT COUNT(*)::int AS n FROM vaccine_table")$n
    total_pets  <- dbGetQuery(con, "SELECT COUNT(*)::int AS n FROM pet_table")$n
    total_owners <- dbGetQuery(con, "SELECT COUNT(*)::int AS n FROM owner_table")$n

    list(
      status          = "ok",
      database        = Sys.getenv("PGDATABASE", "DIGIVETDB"),
      total_vaccinations = total_vax,
      total_pets      = total_pets,
      total_owners    = total_owners,
      message         = "Connected to DIGIVETDB successfully"
    )
  }, error = function(e) {
    res$status <- 500
    list(status = "error", message = conditionMessage(e))
  })
}
