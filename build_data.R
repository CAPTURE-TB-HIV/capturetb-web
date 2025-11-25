#!/usr/bin/env Rscript
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

mod_fixed <- capturetb::unitcost_fixed()
sam_fixed <- as.matrix(mod_fixed$samples())

colnames(sam_fixed) <- convert_bracket_to_underscore(colnames(sam_fixed))

colnames(sam_fixed) <- sapply(colnames(sam_fixed), function(nm) {
  if (nm %in% names(countries)) {
    return(countries[[nm]])
  }
  if (nm %in% names(covariates)) {
    return(covariates[[nm]])
  } else {
    return(nm)
  }
})

write.csv(sam_fixed,
  file = "data/posterior_samples_fixed.csv",
  row.names = FALSE, quote = FALSE
)

pred_fixed <- mod_fixed$predict(
  capturetb::prepare_covariates(test_inputs, mod_fixed),
  scale = "natural",
  summarised = TRUE
)

write(
  jsonlite::toJSON(pred_fixed, auto_unbox = TRUE),
  "test/test_results_fixed.json"
)

mod_ohd <- capturetb::unitcost_ohd()
sam_ohd <- as.matrix(mod_ohd$samples())

colnames(sam_ohd) <- convert_bracket_to_underscore(colnames(sam_ohd))

colnames(sam_ohd) <- sapply(colnames(sam_ohd), function(nm) {
  if (nm %in% names(countries)) {
    return(countries[[nm]])
  }
  if (nm %in% names(covariates)) {
    return(covariates[[nm]])
  } else {
    return(nm)
  }
})

write.csv(sam_ohd,
  file = "data/posterior_samples_ohd.csv",
  row.names = FALSE, quote = FALSE
)

pred_ohd <- mod_ohd$predict(
  capturetb::prepare_covariates(test_inputs, mod_ohd),
  scale = "natural",
  summarised = TRUE
)

write(
  jsonlite::toJSON(pred_ohd, auto_unbox = TRUE),
  "test/test_results_ohd.json"
)
