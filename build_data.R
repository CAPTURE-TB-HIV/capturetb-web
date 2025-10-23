#!/usr/bin/env Rscript
library(coda)

mod <- capturetb::unitcost()
sam <- as.matrix(mod$samples())

convert_bracket_to_underscore <- function(x) {
  gsub("\\[(\\d+)\\]", "_\\1", x)
}

centering_values <- mod$centering_values()
write(
  jsonlite::toJSON(centering_values, auto_unbox = TRUE),
  "data/centering_values.json"
)

output_types <- levels(mod$outputs())
countries <- levels(mod$countries())
covariates <- mod$covariates()

names(output_types) <- paste0("output_effect_", 1:length(output_types))
names(countries) <- paste0("country_effect_", 1:length(countries))
names(covariates) <- paste0("beta_", 1:length(covariates))

colnames(sam) <- convert_bracket_to_underscore(colnames(sam))
sam <- sam[, !grepl("fc_effect", colnames(sam))]

colnames(sam) <- sapply(colnames(sam), function(nm) {
  if (nm %in% names(output_types)) {
    return(output_types[[nm]])
  }
  if (nm %in% names(countries)) {
    return(countries[[nm]])
  }
  if (nm %in% names(covariates)) {
    return(covariates[[nm]])
  } else {
    return(nm)
  }
})

write.csv(sam,
  file = "data/posterior_samples.csv",
  row.names = FALSE, quote = FALSE
)

# for testing Js against R
test_inputs <- data.frame(
  buildingSpace = 10,
  totalVisits = 690000,
  visitsPerFTE = 6,
  logVisits = log(690000),
  logVisitsPP_TB = log(6),
  log_ID_p_bldgspace = log(10),
  primary = c(TRUE, FALSE, FALSE, FALSE),
  secondary = c(FALSE, TRUE, FALSE, FALSE),
  tertiary = c(FALSE, FALSE, TRUE, FALSE),
  urban = c(FALSE, TRUE),
  public = c(TRUE, FALSE),
  n_services = 3,
  output = c("op_treatmentvisit", "op_diagnosticvisit"),
  fc_country = c("Ethiopia", "Unknown")
)

pred <- mod$predict(
  capturetb::prepare_covariates(test_inputs, mod),
  scale = "natural",
  summarised = TRUE
)

write(
  jsonlite::toJSON(test_inputs, auto_unbox = TRUE),
  "test/test_inputs.json"
)
write(
  jsonlite::toJSON(pred, auto_unbox = TRUE),
  "test/test_results.json"
)
