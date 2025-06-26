#!/usr/bin/env Rscript
library(coda)

mod <- capturetb::unitcost()
sam <- as.matrix(mod$samples())

convert_bracket_to_underscore <- function(x) {
  gsub("\\[(\\d+)\\]", "_\\1", x)
}

colnames(sam) <- convert_bracket_to_underscore(colnames(sam))
write.csv(sam, file = "posterior_samples.csv", row.names = FALSE)
