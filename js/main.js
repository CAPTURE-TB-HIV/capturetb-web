import {
	Chart,
	LineController,
	LineElement,
	PointElement,
	LinearScale,
	CategoryScale,
	Title,
	Tooltip,
	Legend,
	Filler
} from 'chart.js';

import annotationPlugin from 'chartjs-plugin-annotation';
import '../scss/styles.scss'

Chart.register(
	Filler,
	LineController,
	LineElement,
	PointElement,
	LinearScale,
	CategoryScale,
	Title,
	Tooltip,
	Legend,
	annotationPlugin
);
import { prepareInputs, predictUnitCost, predictUnitCostFixed, summarizePredictions } from './capturetb.js';

window.global ||= window;

global.posteriorSamples = null;
global.posteriorSamplesFixed = null;
global.posteriorSamplesOhd = null;
global.centeringValues = null;

let chartInstance = null;
global.currentPredictions = null;

const countries = [
	'Ethiopia',
	'Georgia',
	'India',
	'Kenya',
	'Philippines'
];

export function processSamples(text) {
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
	return samples
}

async function loadPosteriorSamples() {
	try {
		const response = await fetch('data/posterior_samples.csv');
		const centeringResponse = await fetch('data/centering_values.json');
		const responseFixed = await fetch('data/posterior_samples_fixed.csv');
		const responseOhd = await fetch('data/posterior_samples_ohd.csv');

		const text = await response.text();
		const textFixed = await responseFixed.text();
		const textOhd = await responseOhd.text();

		global.centeringValues = await centeringResponse.json();
		const samples = processSamples(text);
		global.posteriorSamples = samples;
		global.posteriorSamplesFixed = processSamples(textFixed);
		global.posteriorSamplesOhd = processSamples(textOhd);

		console.log(`Loaded ${samples.length} posterior samples`);
		console.log('Sample structure:', Object.keys(samples[0]));

	} catch (error) {
		console.error('Error loading posterior samples:', error);
		throw error;
	}
}

function gaussianKernel(x, xi, bandwidth) {
	const z = (x - xi) / bandwidth;
	return Math.exp(-0.5 * z * z) / (bandwidth * Math.sqrt(2 * Math.PI));
}

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

function createCostChart(costType, costSamples, meanCost, lowerCI, upperCI, confidenceLevel = 95) {
	const ctx = document.getElementById('costChart').getContext('2d');

	if (chartInstance) {
		chartInstance.destroy();
	}

	// Create evaluation points for smooth curve
	const minCost = Math.min(...costSamples);
	const maxCost = Math.max(...costSamples);
	const range = maxCost - minCost;
	const numPoints = 200;

	const xPoints = [];

	for (let i = 0; i <= numPoints; i++) {
		const x = minCost - 0.1 * range + (1.2 * range * i) / numPoints;
		xPoints.push(x);
	}

	const densities = estimateDensity(costSamples, xPoints);

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
					text: `Probability Distribution of Predicted ${costType} Per Visit`
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
								content: `Mean: $${meanCost}`,
								enabled: true,
								position: 'end',
								z: 1000
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
								content: `${((100 - confidenceLevel) / 2)}%: $${lowerCI}`,
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
								content: `${(100 - (100 - confidenceLevel) / 2)}%: $${upperCI}`,
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
					min: 0,
					title: {
						display: true,
						text: `${costType} Per Visit (2018 Int$)`
					},
					ticks: {
						callback: function (value) {
							return '$' + value;
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
export function updateResultsDisplay(costType) {
	if (!global.currentPredictions) return;

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
		const summary = summarizePredictions(global.currentPredictions, confidenceLevel);

		// Update cost chart (confidence interval visualization changes)
		createCostChart(costType, global.currentPredictions, summary.mean, summary.lower, summary.upper, confidenceLevel);

		// Update credible interval display
		document.getElementById('credible-interval-label').textContent =
			`${confidenceLevel}% Credible Interval:`;
		document.getElementById('credible-interval').textContent =
			'$' + summary.lower + ' - $' + summary.upper;

		// Remove blur effect
		elementsToBlur.forEach(element => {
			if (element) element.classList.remove('recalculating');
		});
	}, 50); // Small delay to ensure UI updates
}

export async function handleFormSubmit(model) {
	let samples;
	let predict;
	let costType;

	if (model == "fixed") {
		samples = global.posteriorSamplesFixed;
		predict = predictUnitCostFixed;
		costType = "Fixed Cost"
	} else if (model == "ohd") {
			samples = global.posteriorSamplesOhd;
		predict = predictUnitCostFixed;
		costType = "Overhead Cost"
	} 
	else {
		samples = global.posteriorSamples;
		predict = predictUnitCost;
		costType = "Cost"
	}	

	if (!samples | !global.centeringValues) {
		alert('Posterior samples not loaded yet!');
		return;
	}

	try {

		const buildingSpace = parseFloat(document.getElementById('building-space').value);
		const totalVisits = parseInt(document.getElementById('total-visits').value);
		const visitsPerFTE = parseFloat(document.getElementById('visits-per-fte').value); ``
		const country = document.getElementById('country').value;
		const level = document.getElementById('level').value;
		const visit_type = document.getElementById('type').value;
		const secondary = level == "secondary";
		const primary = level == "primary";
		const tertiary = level == "tertiary";
		const urban = document.getElementById('urban').checked;
		const publicFacility = document.getElementById('public').checked;
		const n_services = parseInt(document.getElementById('n_services').value);

		const inputs = prepareInputs({
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
		}, centeringValues)

		console.log('Prediction inputs:', inputs);
		global.currentPredictions = predict(inputs, samples, countries);

		// Get initial confidence level (default 95%)
		const confidenceLevel = parseInt(document.getElementById('confidence-level').value);
		const summary = summarizePredictions(global.currentPredictions, confidenceLevel);

		// Update main cost display (doesn't change with confidence level)
		document.getElementById('predicted-cost').textContent =
			'$' + summary.mean;

		document.getElementById('title').textContent = `Predicted ${costType}`;

		// Update confidence-level dependent results display
		updateResultsDisplay(costType);

		document.getElementById('results').style.display = 'block';
		document.getElementById('results').scrollIntoView({ behavior: 'smooth' });

	} catch (error) {
		console.error('Prediction error:', error);
		alert('Error in calculation: ' + error.message);
	}
}

export async function initApp(event, load) {
	console.log("DOM ready")
	try {
		console.log('Loading samples');
		console.log(load);
		if (load) {
			await load();
		} else {
			await loadPosteriorSamples();
		}

		document.getElementById('loading').style.display = 'none';
		document.getElementById('app').style.display = 'block';

		const costForm = document.getElementById('cost-form');
		const submitTotal = document.getElementById('submit-total');
		const submitFixed = document.getElementById('submit-fixed');
		const submitOverhead = document.getElementById('submit-overhead');

		submitTotal.addEventListener('click', (event) => {event.preventDefault(); handleFormSubmit("total")});
		submitFixed.addEventListener('click', (event) => {event.preventDefault(); handleFormSubmit("fixed")});
		submitOverhead.addEventListener('click', (event) => {event.preventDefault(); handleFormSubmit("ohd")})

		costForm.addEventListener('input', () => {
			document.getElementById('results').style.display = 'none';
		});

		document.getElementById('confidence-level').addEventListener('change', updateResultsDisplay);

		console.log('Application initialized successfully');

	} catch (error) {
		console.error('Failed to initialize application:', error);
		document.getElementById('loading').innerHTML =
			'<div class="alert alert-danger">Failed to load model data: ' + error.message + '</div>';
	}
}

document.addEventListener('DOMContentLoaded', initApp);