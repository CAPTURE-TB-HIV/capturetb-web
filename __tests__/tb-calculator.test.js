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
  <canvas id="evpiChart"></canvas>
  <form id="cost-form">
    <input id="building-space" value="2.72" />
    <input id="total-visits" value="1000" />
    <input id="visits-per-patient" value="0.27" />
    <select id="country"><option value="Ethiopia" selected>Ethiopia</option></select>
    <input id="secondary" type="checkbox" />
    <input id="urban" type="checkbox" checked />
    <input id="public" type="checkbox" checked />
    <input id="wtp-threshold" value="5.0" />
  </form>
  <div id="predicted-cost"></div>
  <div id="credible-interval"></div>
  <div id="evpi-user-wtp"></div>
  <div id="wtp-display"></div>
  <div id="evpi-max"></div>
  <div id="uncertainty-percent"></div>
  <div id="evpi-100"></div>
  <div id="evpi-1000"></div>
  <div id="evpi-10000"></div>
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
    test('should generate normal random numbers with default parameters', () => {
      const result = normalRandom();
      expect(typeof result).toBe('number');
      expect(result).toBeCloseTo(0, 1);
    });

    test('should generate normal random numbers with custom mean and sd', () => {
      const result = normalRandom(10, 2);
      expect(typeof result).toBe('number');
      expect(result).toBeCloseTo(10, 1);
    });
  });

  describe('predictUnitCost', () => {
    const mockSamples = [
      {
        alpha_1: 1.0, alpha_2: 1.1, alpha_3: 1.2, alpha_4: 1.3, alpha_5: 1.4,
        beta_1: 0.5, beta_2: -0.3, beta_3: 0.2, beta_4: 0.1, beta_5: -0.1, beta_6: 0.0,
        sigma: 0.5, mu_alpha: 1.0, sigma_alpha: 0.2
      },
      {
        alpha_1: 1.1, alpha_2: 1.2, alpha_3: 1.3, alpha_4: 1.4, alpha_5: 1.5,
        beta_1: 0.6, beta_2: -0.2, beta_3: 0.3, beta_4: 0.2, beta_5: -0.2, beta_6: 0.1,
        sigma: 0.6, mu_alpha: 1.1, sigma_alpha: 0.3
      }
    ];

    const mockInputs = {
      log_USD_p_bldgspace: Math.log(2.72),
      logVisits: Math.log(1000),
      logVisitsPP: Math.log(0.27),
      secondary: false,
      urban: true,
      public: true,
      fc_country: 'Ethiopia'
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

  describe('calculateEVPI', () => {
    const mockCostSamples = [1.0, 2.0, 3.0, 4.0, 5.0];

    test('should calculate EVPI correctly when lambda < mean cost', () => {
      const lambda = 2.0;
      const evpi = calculateEVPI(mockCostSamples, lambda);
      
      expect(typeof evpi).toBe('number');
      expect(evpi).toBeGreaterThanOrEqual(0);
    });

    test('should calculate EVPI correctly when lambda > mean cost', () => {
      const lambda = 4.0;
      const evpi = calculateEVPI(mockCostSamples, lambda);
      
      expect(typeof evpi).toBe('number');
      expect(evpi).toBeGreaterThanOrEqual(0);
    });

    test('should return 0 when lambda equals mean cost', () => {
      const lambda = 3.0; // mean of mockCostSamples
      const evpi = calculateEVPI(mockCostSamples, lambda);
      
      expect(evpi).toBeCloseTo(0, 5);
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
      fetch.mockResolvedValueOnce({
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
    evpiChartInstance = null;
    
    // Reset DOM
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('results').style.display = 'none';
  });

  describe('Country Mapping', () => {
    test('should have correct country mapping', () => {
      expect(countryMapping).toEqual({
        'Ethiopia': 1,
        'Georgia': 2,
        'India': 3,
        'Kenya': 4,
        'Philippines': 5
      });
    });
  });

  describe('Covariate Names', () => {
    test('should have correct covariate names in order', () => {
      expect(covariateNames).toEqual([
        'log_USD_p_bldgspace',
        'logVisits',
        'logVisitsPP',
        'secondary',
        'urban',
        'public'
      ]);
    });
  });

  describe('Form Handling', () => {
    test('should handle form submission without posterior samples', async () => {
      // Mock alert
      global.alert = jest.fn();
      
      const form = document.getElementById('cost-form');
      const event = new Event('submit');
      
      await handleFormSubmit(event);
      
      expect(global.alert).toHaveBeenCalledWith('Posterior samples not loaded yet!');
    });

    test('should process form inputs correctly', () => {
      const buildingSpace = parseFloat(document.getElementById('building-space').value);
      const totalVisits = parseInt(document.getElementById('total-visits').value);
      const visitsPerPatient = parseFloat(document.getElementById('visits-per-patient').value);
      const country = document.getElementById('country').value;
      const secondary = document.getElementById('secondary').checked;
      const urban = document.getElementById('urban').checked;
      const publicFacility = document.getElementById('public').checked;
      const userWTP = parseFloat(document.getElementById('wtp-threshold').value);

      expect(buildingSpace).toBe(2.72);
      expect(totalVisits).toBe(1000);
      expect(visitsPerPatient).toBe(0.27);
      expect(country).toBe('Ethiopia');
      expect(secondary).toBe(false);
      expect(urban).toBe(true);
      expect(publicFacility).toBe(true);
      expect(userWTP).toBe(5.0);
    });
  });
});

describe('Error Handling', () => {
  test('should handle invalid inputs gracefully', () => {
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