
import { normalRandom, sfc32 } from './random.js';

export function prepareInputs({
	n_services,
	buildingSpace,
	totalVisits,
	visitsPerFTE,
	primary,
	secondary,
	tertiary,
	urban,
	publicFacility,
	country,
	visit_type
}, centeringValues) {

	return {
		n_services: n_services - centeringValues.n_services,
		log_ID_p_bldgspace: Math.log(buildingSpace) - centeringValues.log_ID_p_bldgspace,
		logVisits: Math.log(totalVisits) - centeringValues.logVisits,
		logVisitsPP_TB: Math.log(visitsPerFTE) - centeringValues.logVisitsPP_TB,
		primary,
		secondary,
		tertiary,
		urban,
		publicFacility,
		country,
		visit_type
	};

}

export function predictUnitCost(inputs, samples, countries) {

	// to avoid differences due to sigma
	const seed = 1337 ^ 0xDEADBEEF; // 32-bit seed with optional XOR value
	// Pad seed with Phi, Pi and E.
	// https://en.wikipedia.org/wiki/Nothing-up-my-sleeve_number
	const rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed);
	rand()

	const {
		log_ID_p_bldgspace,
		logVisits,
		logVisitsPP_TB,
		primary,
		secondary,
		tertiary,
		urban,
		publicFacility,
		country,
		n_services,
		visit_type
	} = inputs;

	const predictions = [];
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];

		const alpha = sample.alpha;

		let country_effect;
		if (countries.indexOf(country) > -1) {
			country_effect = sample[country];
		} else {
			// Generate new intercept for unknown country using hyperparameters
			country_effect = normalRandom(0, sample.sigma_c, rand);
		}

		const visit_effect = sample[visit_type];
		const facility_effect = normalRandom(0, sample.sigma_f, rand);

		// linear predictor (log scale)
		const mu = alpha +
			sample.log_ID_p_bldgspace * log_ID_p_bldgspace +
			sample.logVisits * logVisits +
			sample.logVisitsPP_TB * logVisitsPP_TB +
			sample.primary * (primary ? 1 : 0) +
			sample.secondary * (secondary ? 1 : 0) +
			sample.tertiary * (tertiary ? 1 : 0) +
			sample.urban * (urban ? 1 : 0) +
			sample.n_services * n_services +
			sample.public * (publicFacility ? 1 : 0);

		const error = normalRandom(0, sample.sigma, rand);
		const logCostPred = mu + country_effect + visit_effect + facility_effect + error

		const costPred = Math.exp(logCostPred);
		predictions.push(costPred);
	}

	return predictions;
}

export function predictUnitCostFixed(inputs, samples, countries) {

	// to avoid differences due to sigma
	const seed = 1337 ^ 0xDEADBEEF; // 32-bit seed with optional XOR value
	// Pad seed with Phi, Pi and E.
	// https://en.wikipedia.org/wiki/Nothing-up-my-sleeve_number
	const rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed);
	rand()

	const {
		log_ID_p_bldgspace,
		logVisits,
		logVisitsPP_TB,
		primary,
		secondary,
		tertiary,
		urban,
		publicFacility,
		country,
		n_services,
		visit_type
	} = inputs;

	const predictions = [];
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];

		const alpha = sample.alpha;

		let country_effect;
		if (countries.indexOf(country) > -1) {
			country_effect = sample[country];
		} else {
			// Generate new intercept for unknown country using hyperparameters
			country_effect = normalRandom(0, sample.sigma_c, rand);
		}

		// linear predictor (log scale)
		const mu = alpha +
			sample.log_ID_p_bldgspace * log_ID_p_bldgspace +
			sample.logVisits * logVisits +
			sample.logVisitsPP_TB * logVisitsPP_TB +
			sample.primary * (primary ? 1 : 0) +
			sample.secondary * (secondary ? 1 : 0) +
			sample.tertiary * (tertiary ? 1 : 0) +
			sample.urban * (urban ? 1 : 0) +
			sample.n_services * n_services +
			sample.public * (publicFacility ? 1 : 0);

		const error = normalRandom(0, sample.sigma, rand);
		const logCostPred = mu + country_effect + error

		const costPred = Math.exp(logCostPred);
		predictions.push(costPred);
	}

	return predictions;
}

export function summarizePredictions(predictions, confidenceLevel = 95) {
	const sorted = [...predictions].sort((a, b) => a - b);
	const n = sorted.length;

	const alpha = (100 - confidenceLevel) / 100;
	const lowerTail = alpha / 2;
	const upperTail = 1 - (alpha / 2);
	return {
		mean: Math.round(predictions.reduce((a, b) => a + b, 0) / n),
		lower: Math.round(sorted[Math.floor(n * lowerTail)]),
		upper: Math.round(sorted[Math.floor(n * upperTail)]),
		samples: predictions
	};
}
