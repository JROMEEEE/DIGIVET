# Launch the DIGIVET R Plumber API.
# Works three ways:
#   1. Double-click start-r-api.bat  (recommended)
#   2. Terminal: Rscript r-api/run.R
#   3. RStudio console: source("r-api/run.R")

library(plumber)

# ── Locate plumber.R regardless of how this script was launched ──
this_file <- local({
  # Via Rscript on the command line
  args      <- commandArgs(trailingOnly = FALSE)
  file_flag <- grep("^--file=", args, value = TRUE)
  if (length(file_flag)) {
    return(normalizePath(sub("^--file=", "", file_flag[1])))
  }
  # Via source() in the R console
  sf <- tryCatch(sys.frame(1)$ofile, error = function(e) NULL)
  if (!is.null(sf)) return(normalizePath(sf))
  # Via RStudio Source button
  if (requireNamespace("rstudioapi", quietly = TRUE) &&
      rstudioapi::isAvailable()) {
    return(normalizePath(rstudioapi::getSourceEditorContext()$path))
  }
  # Last resort: assume cwd is project root
  normalizePath("r-api/run.R")
})

plumber_file <- file.path(dirname(this_file), "plumber.R")

port <- as.integer(Sys.getenv("R_PLUMBER_PORT", "8000"))

message(sprintf("Starting DIGIVET R API  -->  http://localhost:%d", port))
message("Endpoints: /ping   /test-db")
message("Press Ctrl+C (or close window) to stop.\n")

plumb(plumber_file)$run(host = "127.0.0.1", port = port)
