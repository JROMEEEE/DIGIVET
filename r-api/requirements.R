# Run this once to install required packages.
# Works from any working directory — just open in RStudio and click Source.

pkgs <- c("plumber", "DBI", "RPostgres", "dplyr", "cluster")
missing_pkgs <- pkgs[!pkgs %in% installed.packages()[, "Package"]]

if (length(missing_pkgs)) {
  message("Installing: ", paste(missing_pkgs, collapse = ", "))
  install.packages(missing_pkgs)
  message("Done.")
} else {
  message("All packages already installed.")
}
