// Global variables
let posteriorSamples = null;
let chartInstance = null;
let evpiChartInstance = null;

// Country mapping (1-indexed as in R)
const countryMapping = {
    'Ethiopia': 1,    // alpha_1
    'Georgia': 2,     // alpha_2  
    'India': 3,       // alpha_3
    'Kenya': 4,       // alpha_4
    'Philippines': 5  // alpha_5
};

// Covariate names in order
const covariateNames = [
    'log_USD_p_bldgspace',  // beta_1
    'logVisits',            // beta_2
    'logVisitsPP',          // beta_3
    'secondary',            // beta_4
    'urban',                // beta_5
    'public'                // beta_6
];

// Load posterior samples from CSV
async function loadPosteriorSamples() {
    try {
        const response = await fetch('posterior_samples.csv');
        const text = await response.text();
        
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

// Generate normal random number (Box-Muller transform)
function normalRandom(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * sd + mean;
}

// Replicate the MixedEffects predict method in JavaScript
function predictUnitCost(inputs, samples) {
    const {
        log_USD_p_bldgspace,
        logVisits, 
        logVisitsPP,
        secondary,
        urban,
        public: publicFacility,
        fc_country
    } = inputs;

    const predictions = [];
    
    for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        
        // Get country-specific intercept
        let alpha;
        if (fc_country in countryMapping) {
            const countryIndex = countryMapping[fc_country];
            alpha = sample[`alpha_${countryIndex}`];
        } else {
            // Generate new intercept for unknown country using hyperparameters
            alpha = normalRandom(sample.mu_alpha, sample.sigma_alpha);
        }
        
        // Get coefficients
        const beta1 = sample.beta_1; // log_USD_p_bldgspace
        const beta2 = sample.beta_2; // logVisits
        const beta3 = sample.beta_3; // logVisitsPP
        const beta4 = sample.beta_4; // secondary
        const beta5 = sample.beta_5; // urban
        const beta6 = sample.beta_6; // public
        
        // Calculate linear predictor (log scale)
        const mu = alpha + 
                  beta1 * log_USD_p_bldgspace +
                  beta2 * logVisits +
                  beta3 * logVisitsPP +
                  beta4 * (secondary ? 1 : 0) +
                  beta5 * (urban ? 1 : 0) +
                  beta6 * (publicFacility ? 1 : 0);
        
        // Add residual uncertainty
        const sigma = sample.sigma;
        const logCostPred = normalRandom(mu, sigma);
        
        // Transform to natural scale
        const costPred = Math.exp(logCostPred);
        predictions.push(costPred);
    }
    
    return predictions;
}

// Calculate summary statistics
function summarizePredictions(predictions) {
    const sorted = [...predictions].sort((a, b) => a - b);
    const n = sorted.length;
    
    return {
        mean: predictions.reduce((a, b) => a + b, 0) / n,
        lower: sorted[Math.floor(n * 0.025)],
        upper: sorted[Math.floor(n * 0.975)],
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
function createCostChart(costSamples, meanCost, lowerCI, upperCI) {
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
            label: '95% Credible Interval',
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
                                content: `2.5%: $${lowerCI.toFixed(2)}`,
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
                                content: `97.5%: $${upperCI.toFixed(2)}`,
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
                        text: 'Unit Cost (USD)'
                    },
                    ticks: {
                        callback: function(value) {
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

// Create EVPI vs WTP threshold chart
function createEVPIChart(costSamples, userWTP, meanCost) {
    const ctx = document.getElementById('evpiChart').getContext('2d');
    
    // Destroy existing chart
    if (evpiChartInstance) {
        evpiChartInstance.destroy();
    }
    
    // Create WTP threshold range around user input and mean cost
    const minCost = Math.min(...costSamples);
    const maxCost = Math.max(...costSamples);
    const range = maxCost - minCost;
    
    // Create wider range for WTP thresholds
    const wtpMin = Math.max(0, Math.min(minCost, userWTP, meanCost) - 0.5 * range);
    const wtpMax = Math.max(maxCost, userWTP, meanCost) + 0.5 * range;
    const numPoints = 100;
    
    const wtpThresholds = [];
    const evpiValues = [];
    
    for (let i = 0; i <= numPoints; i++) {
        const wtp = wtpMin + (wtpMax - wtpMin) * i / numPoints;
        const evpi = calculateEVPI(costSamples, wtp);
        wtpThresholds.push(wtp);
        evpiValues.push(evpi);
    }
    
    // Find maximum EVPI and its corresponding WTP
    const maxEVPI = Math.max(...evpiValues);
    const maxEVPIIndex = evpiValues.indexOf(maxEVPI);
    const optimalWTP = wtpThresholds[maxEVPIIndex];
    
    evpiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: wtpThresholds.map(w => w.toFixed(2)),
            datasets: [{
                label: 'EVPI',
                data: evpiValues,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: 'Expected Value of Perfect Information vs. WTP Threshold'
                },
                legend: {
                    display: false
                },
                annotation: {
                    annotations: {
                        userWTP: {
                            type: 'line',
                            mode: 'vertical',
                            scaleID: 'x',
                            value: wtpThresholds.findIndex(w => Math.abs(w - userWTP) < 0.01),
                            borderColor: 'rgba(255, 99, 132, 0.8)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `Your WTP: $${userWTP.toFixed(2)}`,
                                enabled: true,
                                position: 'top'
                            }
                        },
                        meanCost: {
                            type: 'line',
                            mode: 'vertical',
                            scaleID: 'x',
                            value: wtpThresholds.findIndex(w => Math.abs(w - meanCost) < 0.01),
                            borderColor: 'rgba(153, 102, 255, 0.8)',
                            borderWidth: 2,
                            borderDash: [3, 3],
                            label: {
                                content: `Expected Cost: $${meanCost.toFixed(2)}`,
                                enabled: true,
                                position: 'bottom'
                            }
                        },
                        maxEVPI: {
                            type: 'point',
                            scaleID: 'x',
                            value: maxEVPIIndex,
                            yValue: maxEVPI,
                            backgroundColor: 'rgba(255, 206, 86, 0.8)',
                            borderColor: 'rgba(255, 206, 86, 1)',
                            borderWidth: 2,
                            radius: 6,
                            label: {
                                content: `Max EVPI: $${maxEVPI.toFixed(2)}`,
                                enabled: true,
                                position: 'top'
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Willingness-to-Pay Threshold (USD)'
                    },
                    ticks: {
                        callback: function(value, index) {
                            // Show every 10th label to avoid crowding
                            if (index % 10 === 0) {
                                return '$' + wtpThresholds[index].toFixed(1);
                            }
                            return '';
                        }
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'EVPI (USD per visit)'
                    },
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(2);
                        }
                    }
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
    
    return { maxEVPI, optimalWTP };
}

// Handle form submission
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!posteriorSamples) {
        alert('Posterior samples not loaded yet!');
        return;
    }
    
    // Get form values
    const buildingSpace = parseFloat(document.getElementById('building-space').value);
    const totalVisits = parseInt(document.getElementById('total-visits').value);
    const visitsPerPatient = parseFloat(document.getElementById('visits-per-patient').value);
    const country = document.getElementById('country').value;
    const secondary = document.getElementById('secondary').checked;
    const urban = document.getElementById('urban').checked;
    const publicFacility = document.getElementById('public').checked;
    const userWTP = parseFloat(document.getElementById('wtp-threshold').value);
    
    // Prepare inputs (transform to log scale where needed)
    const inputs = {
        log_USD_p_bldgspace: Math.log(buildingSpace),
        logVisits: Math.log(totalVisits),
        logVisitsPP: Math.log(visitsPerPatient),
        secondary: secondary,
        urban: urban,
        public: publicFacility,
        fc_country: country
    };
    
    console.log('Prediction inputs:', inputs);
    
    try {
        // Generate predictions
        const predictions = predictUnitCost(inputs, posteriorSamples);
        const summary = summarizePredictions(predictions);
        
        console.log('Prediction summary:', summary);
        
        // Calculate EVPI at user's WTP threshold
        const evpiAtUserWTP = calculateEVPI(predictions, userWTP);
        
        // Create charts and get max EVPI info
        createCostChart(predictions, summary.mean, summary.lower, summary.upper);
        const evpiInfo = createEVPIChart(predictions, userWTP, summary.mean);
        
        // Update display
        document.getElementById('predicted-cost').textContent = 
            '$' + summary.mean.toFixed(2);
        document.getElementById('credible-interval').textContent = 
            '$' + summary.lower.toFixed(2) + ' - $' + summary.upper.toFixed(2);
        
        // EVPI analysis
        document.getElementById('evpi-user-wtp').textContent = 
            '$' + evpiAtUserWTP.toFixed(2) + ' per visit';
        document.getElementById('wtp-display').textContent = 
            '$' + userWTP.toFixed(2);
        document.getElementById('evpi-max').textContent = 
            '$' + evpiInfo.maxEVPI.toFixed(2) + ' per visit';
        
        const uncertaintyPercent = (evpiInfo.maxEVPI / summary.mean * 100);
        document.getElementById('uncertainty-percent').textContent = 
            uncertaintyPercent.toFixed(1) + '%';
        
        // Scale analysis (using user's WTP EVPI)
        document.getElementById('evpi-100').textContent = 
            '$' + (evpiAtUserWTP * 100).toFixed(0);
        document.getElementById('evpi-1000').textContent = 
            '$' + (evpiAtUserWTP * 1000).toFixed(0);
        document.getElementById('evpi-10000').textContent = 
            '$' + (evpiAtUserWTP * 10000).toFixed(0);
        
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
    try {
        posteriorSamples = await loadPosteriorSamples();
        
        // Hide loading, show app
        document.getElementById('loading').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        
        // Set up form handler
        document.getElementById('cost-form').addEventListener('submit', handleFormSubmit);
        
        console.log('Application initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('loading').innerHTML = 
            '<div class="alert alert-danger">Failed to load model data: ' + error.message + '</div>';
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initApp);