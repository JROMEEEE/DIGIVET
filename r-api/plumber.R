# DIGIVET R Plumber API
# Runs alongside the Node.js server and exposes analytics endpoints.
# Start with: source("r-api/run.R")  OR  Rscript r-api/run.R

library(plumber)
library(DBI)
library(RPostgres)

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
        COUNT(DISTINCT v.vaccine_id)::int  AS vaccination_count,
        COUNT(DISTINCT p.pet_id)::int      AS total_pets
      FROM barangay_table b
      LEFT JOIN owner_table  o ON o.barangay_id = b.barangay_id
      LEFT JOIN pet_table    p ON p.owner_id     = o.owner_id
      LEFT JOIN vaccine_table v ON v.pet_id      = p.pet_id
      GROUP BY b.barangay_id, b.barangay_name
      ORDER BY vaccination_count DESC
    ")

    df$coverage_rate <- round(
      df$vaccination_count / pmax(df$total_pets, 1) * 100, 1
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
