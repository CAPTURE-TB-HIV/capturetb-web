/**
 * @jest-environment jsdom
 */

// Import the functions to test
// Note: We need to load the script in a way that makes functions available
const fs = require('fs');
const path = require('path');

// Read the tb-calculator.js file
const calculatorScript = fs.readFileSync(path.join(__dirname, '../tb-calculator.js'), 'utf8');

// Create a mock DOM environment
document.body.innerHTML = `
  <div id="loading"></div>
  <div id="app"></div>
  <div id="results"></div>
  <canvas id="costChart"></canvas>
  <form id="cost-form">
    <input id="building-space" value="2.72" />
    <input id="total-visits" value="1000" />
    <input id="visits-per-fte" value="0.27" />
    <select id="country"><option value="Ethiopia" selected>Ethiopia</option></select>
    <input id="secondary" type="checkbox" />
    <input id="urban" type="checkbox" checked />
    <input id="public" type="checkbox" checked />
  </form>
  <div id="predicted-cost"></div>
  <div id="credible-interval"></div>
`;

// Execute the script to make functions available
eval(calculatorScript);

describe('TB Calculator Core Functions', () => {
	beforeEach(() => {
		// Reset Math.random mock
		Math.random.mockReturnValue(0.5);

		// Reset fetch mock
		fetch.mockClear();
	});

	describe('normalRandom', () => {

		const seed = 1337 ^ 0xDEADBEEF; // 32-bit seed with optional XOR value
		// Pad seed with Phi, Pi and E.
		// https://en.wikipedia.org/wiki/Nothing-up-my-sleeve_number
		const rand = sfc32(0x9E3779B9, 0x243F6A88, 0xB7E15162, seed);
		rand()


		test('should generate normal random numbers with custom mean and sd', () => {
			const result = normalRandom(10, 0.01, rand);
			expect(typeof result).toBe('number');
			expect(result).toBeCloseTo(10, 1);
			expect(result).not.toEqual(10);
		});
	});

	describe('predictUnitCost', () => {
		const mockSamples = [
			{
				alpha: 1.0, Ethiopia: 1.1, Kenya: -0.1, Philippines: 1.3, Georgia: 1.4, India: -1.1,
				log_ID_p_bldgspace: 0.5, logVisits: -0.3, logVisitsPP_TB: 0.2, primary: 0.1, secondary: -0.1, tertiary: 0.0,
				n_services: 0.2, urban: 0.3, public: -0.2, op_treatmentvisit: 0.1,
				sigma: 0.5, sigma_c: 0.3, sigma_f: 0.2, sigma_v: 0.1
			}
		];

		const mockInputs = {
			log_ID_p_bldgspace: Math.log(2.72),
			logVisits: Math.log(1000),
			logVisitsPP_TB: Math.log(0.27),
			primary: false,
			secondary: false,
			tertiary: false,
			n_services: 1,
			visit_type: "op_treatmentvisit",
			urban: true,
			public: true,
			country: 'Ethiopia'
		};

		test('should return predictions array with correct length', () => {
			const predictions = predictUnitCost(mockInputs, mockSamples);
			expect(Array.isArray(predictions)).toBe(true);
			expect(predictions.length).toBe(mockSamples.length);
		});

		test('should return positive cost predictions', () => {
			const predictions = predictUnitCost(mockInputs, mockSamples);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
				expect(typeof pred).toBe('number');
			});
		});

		test('should handle unknown country', () => {
			const inputsUnknownCountry = { ...mockInputs, fc_country: 'Unknown' };
			const predictions = predictUnitCost(inputsUnknownCountry, mockSamples);
			expect(predictions.length).toBe(mockSamples.length);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
			});
		});
	});

	describe('summarizePredictions', () => {
		const mockPredictions = [1.0, 2.0, 3.0, 4.0, 5.0];

		test('should calculate correct summary statistics', () => {
			const summary = summarizePredictions(mockPredictions);

			expect(summary.mean).toBe(3.0);
			expect(summary.lower).toBe(1.0); // 2.5th percentile
			expect(summary.upper).toBe(5.0); // 97.5th percentile
			expect(summary.samples).toEqual(mockPredictions);
		});

		test('should handle single prediction', () => {
			const singlePrediction = [2.5];
			const summary = summarizePredictions(singlePrediction);

			expect(summary.mean).toBe(2.5);
			expect(summary.lower).toBe(2.5);
			expect(summary.upper).toBe(2.5);
		});
	});

	describe('gaussianKernel', () => {
		test('should calculate kernel density correctly', () => {
			const result = gaussianKernel(0, 0, 1);
			expect(result).toBeCloseTo(0.3989, 3); // 1/sqrt(2π) ≈ 0.3989
		});

		test('should return smaller values for points further from center', () => {
			const center = gaussianKernel(0, 0, 1);
			const far = gaussianKernel(2, 0, 1);
			expect(far).toBeLessThan(center);
		});
	});

	describe('estimateDensity', () => {
		const mockSamples = [1, 2, 3, 4, 5];
		const mockPoints = [1, 2, 3, 4, 5];

		test('should return density estimates for all points', () => {
			const densities = estimateDensity(mockSamples, mockPoints);

			expect(Array.isArray(densities)).toBe(true);
			expect(densities.length).toBe(mockPoints.length);
			densities.forEach(density => {
				expect(density).toBeGreaterThan(0);
				expect(typeof density).toBe('number');
			});
		});

		test('should use custom bandwidth when provided', () => {
			const densities1 = estimateDensity(mockSamples, mockPoints, 0.5);
			const densities2 = estimateDensity(mockSamples, mockPoints, 1.0);

			expect(densities1).not.toEqual(densities2);
		});
	});

	describe('loadPosteriorSamples', () => {
		test('should handle CSV loading successfully', async () => {
			const mockCSV = 'alpha_1,beta_1,sigma\n1.0,0.5,0.3\n1.1,0.6,0.4';
			fetch.mockResolvedValue({
				json: () => Promise.resolve({ "centering": "values" })
			})
				.mockResolvedValueOnce({
					text: () => Promise.resolve(mockCSV)
				});
			const samples = await loadPosteriorSamples();

			expect(Array.isArray(samples)).toBe(true);
			expect(samples.length).toBe(2);
			expect(samples[0]).toHaveProperty('alpha_1', 1.0);
			expect(samples[0]).toHaveProperty('beta_1', 0.5);
			expect(samples[0]).toHaveProperty('sigma', 0.3);
		});

		test('should handle fetch errors', async () => {
			fetch.mockRejectedValueOnce(new Error('Network error'));
			await expect(loadPosteriorSamples()).rejects.toThrow('Network error');
		});
	});
});

describe('TB Calculator Integration Tests', () => {
	beforeEach(() => {
		// Reset global variables
		posteriorSamples = null;
		chartInstance = null;

		// Reset DOM
		document.getElementById('loading').style.display = 'flex';
		document.getElementById('app').style.display = 'none';
		document.getElementById('results').style.display = 'none';
	});

	describe('Form Handling', () => {
		test('should handle form submission without posterior samples', async () => {
			global.alert = jest.fn();
			const event = new Event('submit');
			await handleFormSubmit(event);
			expect(global.alert).toHaveBeenCalledWith('Posterior samples not loaded yet!');
		});
	});
});

describe('Error Handling', () => {
	test('should handle invalid inputs', () => {
		const mockSamples = [{
			alpha_1: 1.0, beta_1: 0.5, sigma: 0.3,
			mu_alpha: 1.0, sigma_alpha: 0.2
		}];

		const invalidInputs = {
			log_USD_p_bldgspace: NaN,
			logVisits: Math.log(1000),
			logVisitsPP: Math.log(0.27),
			secondary: false,
			urban: true,
			public: true,
			fc_country: 'Ethiopia'
		};

		const predictions = predictUnitCost(invalidInputs, mockSamples);
		expect(predictions.length).toBe(1);
		// Should still return a result even with NaN input
	});

	test('should handle empty samples array', () => {
		const mockInputs = {
			log_USD_p_bldgspace: Math.log(2.72),
			logVisits: Math.log(1000),
			logVisitsPP: Math.log(0.27),
			secondary: false,
			urban: true,
			public: true,
			fc_country: 'Ethiopia'
		};

		const predictions = predictUnitCost(mockInputs, []);
		expect(predictions).toEqual([]);
	});
});