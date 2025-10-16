// Global variables
let posteriorSamples = null;
let chartInstance = null;
let currentPredictions = null;
let currentInputs = null;
let centeringValues = null;

const countries = [
	'Ethiopia',
	'Georgia',
	'India',
	'Kenya',
	'Philippines'
];

// Load posterior samples from CSV
async function loadPosteriorSamples() {
	try {
		const response = await fetch('posterior_samples.csv');
		const centeringResponse = await fetch('centering_values.json');
		const text = await response.text();

		centeringValues = await centeringResponse.json();

		const lines = text.trim().split('\n');
		const headers = lines[0].split(',');

		const samples = [];
		for (let i = 1; i < lines.length; i++) {
			const values = lines[i].split(',').map(parseFloat);
			const sample = {};
			headers.forEach((header, index) => {
				sample[header] = values[index];
			});
			samples.push(sample);
		}

		console.log(`Loaded ${samples.length} posterior samples`);
		console.log('Sample structure:', Object.keys(samples[0]));
		return samples;

	} catch (error) {
		console.error('Error loading posterior samples:', error);
		throw error;
	}
}

function sfc32(a, b, c, d) {
	return function () {
		a |= 0; b |= 0; c |= 0; d |= 0;
		let t = (a + b | 0) + d | 0;
		d = d + 1 | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = (c << 21 | c >>> 11);
		c = c + t | 0;
		return (t >>> 0) / 4294967296;
	}
}

// Generate normal random number (Box-Muller transform)
function normalRandom(mean, sd, rand) {
	let u = 0, v = 0;
	while (u === 0) u = rand(); // Converting [0,1) to (0,1)
	while (v === 0) v = rand();
	let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return z * sd + mean;
}

function predictUnitCost(inputs, samples) {

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
		public,
		country,
		n_services,
		visit_type
	} = inputs;

	const predictions = [];
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];

		const alpha = sample.alpha;

		// Get country effects
		let country_effect;
		if (country in countries) {
			country_effect = sample[country];
		} else {
			// Generate new intercept for unknown country using hyperparameters
			country_effect = normalRandom(0, sample.sigma_c, rand);
		}

		// Get visit effects
		const visit_effect = sample[visit_type];

		// Calculate linear predictor (log scale)
		const mu = alpha +
			sample.log_ID_p_bldgspace * log_ID_p_bldgspace +
			sample.logVisits * logVisits +
			sample.logVisitsPP_TB * logVisitsPP_TB +
			sample.primary * (primary ? 1 : 0) +
			sample.secondary * (secondary ? 1 : 0) +
			sample.tertiary * (tertiary ? 1 : 0) +
			sample.primary * (urban ? 1 : 0) +
			sample.n_services * n_services +
			sample.tertiary * (public ? 1 : 0);

		const residuals = normalRandom(0, sample.sigma, rand);
		const logCostPred = mu + country_effect + visit_effect + residuals

		const costPred = Math.exp(logCostPred);
		predictions.push(costPred);
	}

	return predictions;
}

// Calculate summary statistics
function summarizePredictions(predictions, confidenceLevel = 95) {
	const sorted = [...predictions].sort((a, b) => a - b);
	const n = sorted.length;

	// Calculate tail probabilities based on confidence level
	const alpha = (100 - confidenceLevel) / 100;
	const lowerTail = alpha / 2;
	const upperTail = 1 - (alpha / 2);

	return {
		mean: predictions.reduce((a, b) => a + b, 0) / n,
		lower: sorted[Math.floor(n * lowerTail)],
		upper: sorted[Math.floor(n * upperTail)],
		samples: predictions
	};
}

// Calculate EVPI
function calculateEVPI(costSamples, lambda) {
	const expectedLossUncertainty = costSamples
		.map(c => Math.max(0, c - lambda))
		.reduce((a, b) => a + b, 0) / costSamples.length;

	const meanCost = costSamples.reduce((a, b) => a + b, 0) / costSamples.length;
	const expectedLossCertainty = Math.max(0, meanCost - lambda);

	return expectedLossUncertainty - expectedLossCertainty;
}

// Gaussian kernel for density estimation
function gaussianKernel(x, xi, bandwidth) {
	const z = (x - xi) / bandwidth;
	return Math.exp(-0.5 * z * z) / (bandwidth * Math.sqrt(2 * Math.PI));
}

// Estimate probability density using kernel density estimation
function estimateDensity(samples, points, bandwidth = null) {
	if (!bandwidth) {
		// Silverman's rule of thumb for bandwidth
		const n = samples.length;
		const std = Math.sqrt(samples.reduce((sum, x) => {
			const mean = samples.reduce((a, b) => a + b, 0) / n;
			return sum + Math.pow(x - mean, 2);
		}, 0) / (n - 1));
		bandwidth = 1.06 * std * Math.pow(n, -0.2);
	}

	return points.map(x => {
		return samples.reduce((sum, xi) => {
			return sum + gaussianKernel(x, xi, bandwidth);
		}, 0) / samples.length;
	});
}

// Create smooth density chart
function createCostChart(costSamples, meanCost, lowerCI, upperCI, confidenceLevel = 95) {
	const ctx = document.getElementById('costChart').getContext('2d');

	// Destroy existing chart
	if (chartInstance) {
		chartInstance.destroy();
	}

	// Create evaluation points for smooth curve
	const minCost = Math.min(...costSamples);
	const maxCost = Math.max(...costSamples);
	const range = maxCost - minCost;
	const numPoints = 200;

	const xPoints = [];
	const densityPoints = [];

	for (let i = 0; i <= numPoints; i++) {
		const x = minCost - 0.1 * range + (1.2 * range * i) / numPoints;
		xPoints.push(x);
	}

	// Estimate density
	const densities = estimateDensity(costSamples, xPoints);

	// Create datasets
	const datasets = [{
		label: 'Probability Density',
		data: xPoints.map((x, i) => ({ x: x, y: densities[i] })),
		borderColor: 'rgba(54, 162, 235, 1)',
		backgroundColor: 'rgba(54, 162, 235, 0.1)',
		fill: true,
		tension: 0.4,
		pointRadius: 0,
		borderWidth: 2
	}];

	// Add confidence interval shading
	const ciXPoints = xPoints.filter(x => x >= lowerCI && x <= upperCI);
	const ciDensities = estimateDensity(costSamples, ciXPoints);

	if (ciXPoints.length > 0) {
		datasets.push({
			label: `${confidenceLevel}% Credible Interval`,
			data: ciXPoints.map((x, i) => ({ x: x, y: ciDensities[i] })),
			borderColor: 'rgba(255, 206, 86, 0.8)',
			backgroundColor: 'rgba(255, 206, 86, 0.3)',
			fill: true,
			tension: 0.4,
			pointRadius: 0,
			borderWidth: 1
		});
	}

	chartInstance = new Chart(ctx, {
		type: 'line',
		data: {
			datasets: datasets
		},
		options: {
			responsive: true,
			plugins: {
				title: {
					display: true,
					text: 'Probability Distribution of Predicted Unit Costs'
				},
				legend: {
					display: true
				},
				annotation: {
					annotations: {
						meanLine: {
							type: 'line',
							mode: 'vertical',
							scaleID: 'x',
							value: meanCost,
							borderColor: 'rgba(255, 99, 132, 0.8)',
							borderWidth: 2,
							borderDash: [5, 5],
							label: {
								content: `Mean: $${meanCost.toFixed(2)}`,
								enabled: true,
								position: 'top'
							}
						},
						lowerCI: {
							type: 'line',
							mode: 'vertical',
							scaleID: 'x',
							value: lowerCI,
							borderColor: 'rgba(75, 192, 192, 0.6)',
							borderWidth: 1,
							borderDash: [3, 3],
							label: {
								content: `${((100 - confidenceLevel) / 2).toFixed(1)}%: $${lowerCI.toFixed(2)}`,
								enabled: true,
								position: 'start'
							}
						},
						upperCI: {
							type: 'line',
							mode: 'vertical',
							scaleID: 'x',
							value: upperCI,
							borderColor: 'rgba(75, 192, 192, 0.6)',
							borderWidth: 1,
							borderDash: [3, 3],
							label: {
								content: `${(100 - (100 - confidenceLevel) / 2).toFixed(1)}%: $${upperCI.toFixed(2)}`,
								enabled: true,
								position: 'end'
							}
						}
					}
				}
			},
			scales: {
				x: {
					type: 'linear',
					title: {
						display: true,
						text: 'Unit Cost (2018 Int$)'
					},
					ticks: {
						callback: function (value) {
							return '$' + value.toFixed(2);
						}
					}
				},
				y: {
					title: {
						display: true,
						text: 'Probability Density'
					},
					beginAtZero: true
				}
			},
			interaction: {
				intersect: false,
				mode: 'index'
			},
			elements: {
				point: {
					radius: 0
				}
			}
		}
	});
}

// Update results display with new confidence level
function updateResultsDisplay() {
	if (!currentPredictions) return;

	const elementsToBlur = [
		document.getElementById('credible-interval-label'),
		document.getElementById('credible-interval'),
		document.getElementById('costChart').parentElement.parentElement // chart card
	];

	elementsToBlur.forEach(element => {
		if (element) element.classList.add('recalculating');
	});

	// Use setTimeout to allow UI to update before heavy computation
	setTimeout(() => {
		const confidenceLevel = parseInt(document.getElementById('confidence-level').value);

		// Recalculate summary with new confidence level
		const summary = summarizePredictions(currentPredictions, confidenceLevel);

		// Update cost chart (confidence interval visualization changes)
		createCostChart(currentPredictions, summary.mean, summary.lower, summary.upper, confidenceLevel);

		// Update credible interval display
		document.getElementById('credible-interval-label').textContent =
			`${confidenceLevel}% Credible Interval:`;
		document.getElementById('credible-interval').textContent =
			'$' + summary.lower.toFixed(2) + ' - $' + summary.upper.toFixed(2);

		// Remove blur effect
		elementsToBlur.forEach(element => {
			if (element) element.classList.remove('recalculating');
		});
	}, 50); // Small delay to ensure UI updates
}

async function handleFormSubmit(event) {
	event.preventDefault();

	if (!posteriorSamples | !centeringValues) {
		alert('Posterior samples not loaded yet!');
		return;
	}


	try {

		const buildingSpace = parseFloat(document.getElementById('building-space').value);
		const totalVisits = parseInt(document.getElementById('total-visits').value);
		const visitsPerPatient = parseFloat(document.getElementById('visits-per-fte').value);
		const country = document.getElementById('country').value;
		const level = document.getElementById('level').value;
		const visit_type = document.getElementById('type').value;
		const secondary = level == "secondary";
		const primary = level == "primary";
		const tertiary = level == "tertiary";
		const urban = document.getElementById('urban').checked;
		const public = document.getElementById('public').checked;
		const n_services = parseInt(document.getElementById('n_services').value);

		// Prepare inputs
		const inputs = {
			n_services: n_services - centeringValues.n_services,
			log_ID_p_bldgspace: Math.log(buildingSpace) - centeringValues.log_ID_p_bldgspace,
			logVisits: Math.log(totalVisits) - centeringValues.logVisits,
			logVisitsPP_TB: Math.log(visitsPerPatient) - centeringValues.logVisitsPP_TB,
			primary,
			secondary,
			tertiary,
			urban,
			public,
			country,
			visit_type
		};

		console.log('Prediction inputs:', inputs);

		// Generate predictions (this is the expensive part)
		currentPredictions = predictUnitCost(inputs, posteriorSamples);
		currentInputs = inputs;

		// Get initial confidence level (default 95%)
		const confidenceLevel = parseInt(document.getElementById('confidence-level').value);
		const summary = summarizePredictions(currentPredictions, confidenceLevel);

		console.log('Prediction summary:', summary);

		// Update main cost display (doesn't change with confidence level)
		document.getElementById('predicted-cost').textContent =
			'$' + summary.mean.toFixed(2);

		// Update confidence-level dependent results display
		updateResultsDisplay();

		// Show results
		document.getElementById('results').style.display = 'block';
		document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

	} catch (error) {
		console.error('Prediction error:', error);
		alert('Error in calculation: ' + error.message);
	}
}

// Initialize application
async function initApp() {
	console.log("domcontect ready")
	try {
		console.log('Loading samples');
		posteriorSamples = await loadPosteriorSamples();

		// Hide loading, show app
		document.getElementById('loading').style.display = 'none';
		document.getElementById('app').style.display = 'block';

		// Set up form handler
		document.getElementById('cost-form').addEventListener('submit', handleFormSubmit);

		// Set up confidence level change handler
		document.getElementById('confidence-level').addEventListener('change', updateResultsDisplay);

		console.log('Application initialized successfully');

	} catch (error) {
		console.error('Failed to initialize application:', error);
		document.getElementById('loading').innerHTML =
			'<div class="alert alert-danger">Failed to load model data: ' + error.message + '</div>';
	}
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);