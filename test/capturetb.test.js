import * as fs from "fs";
import * as path from "path";
import { prepareInputs, predictUnitCost, predictUnitCostFixed, summarizePredictions } from "../js/capturetb.js";
import centering from "../data/centering_values.json";
import testInputs from "./test_inputs.json";
import testResults from "./test_results.json";
import testResultsFixed from "./test_results_fixed.json";
import { processSamples } from "../js/main.js";

const countries = [
	'Ethiopia',
	'Georgia',
	'India',
	'Kenya',
	'Philippines'
];

const samplesCSV = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples.csv"), "utf8");
const samples = processSamples(samplesCSV);

const samplesExtendedCSV = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples_extended.csv"), "utf8");
const samplesExtended = processSamples(samplesExtendedCSV);

const samplesFixedCSV = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples_fixed.csv"), "utf8");
const samplesFixed = processSamples(samplesFixedCSV);

const samplesFixedExtendedCSV = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples_fixed_extended.csv"), "utf8");
const samplesFixedExtended = processSamples(samplesFixedExtendedCSV);

describe('capturetb', () => {

	describe('predictUnitCost', () => {

		const mockInputs = {
			log_ID_p_bldgspace: Math.log(2.72) - centering.log_ID_p_bldgspace,
			logVisits: Math.log(1000) - centering.logVisits,
			logVisitsPP_TB: Math.log(2) - centering.logVisitsPP_TB,
			primary: false,
			secondary: false,
			tertiary: false,
			visit_type: "op_treatmentvisit",
			urban: true,
			public: true,
			country: 'Ethiopia'
		};

		test('should return predictions array with correct length', () => {
			const predictions = predictUnitCost(mockInputs, samples, countries);
			expect(Array.isArray(predictions)).toBe(true);
			expect(predictions.length).toBe(samples.length);
		});

		test('should return positive cost predictions', () => {
			const predictions = predictUnitCost(mockInputs, samples, countries);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
				expect(typeof pred).toBe('number');
			});
		});

		test('should return positive cost predictions for extended model', () => {
			const predictions = predictUnitCost(mockInputs, samplesExtended, countries, true);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
				expect(typeof pred).toBe('number');
			});
		});

		test('should handle unknown country', () => {
			const inputsUnknownCountry = { ...mockInputs, fc_country: 'Unknown' };
			const predictions = predictUnitCost(inputsUnknownCountry, samples, countries);
			expect(predictions.length).toBe(samples.length);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
			});
		});

		test("predictions match R package", async () => {
			for (let i = 0; i < testInputs.length; i++) {
				const preparedInputs = prepareInputs({
					...testInputs[i],
					country: testInputs[i].fc_country,
					visit_type: testInputs[i].output,
					publicFacility: testInputs[i].public
				},
					centering);
				const pred = summarizePredictions(predictUnitCost(preparedInputs, samples, countries));
				expect(pred.mean).toBeCloseTo(testResults[i].Mean, 0);
				expect(pred.lower).toBeCloseTo(testResults[i].CI_low, 0);
				expect(pred.upper).toBeCloseTo(testResults[i].CI_high, 0);
			}
		});
	});


	describe('predictUnitCostFixed', () => {

		const mockInputs = {
			log_ID_p_bldgspace: Math.log(2.72) - centering.log_ID_p_bldgspace,
			logVisits: Math.log(1000) - centering.logVisits,
			logVisitsPP_TB: Math.log(2) - centering.logVisitsPP_TB,
			primary: false,
			secondary: false,
			tertiary: false,
			visit_type: "op_treatmentvisit",
			urban: true,
			public: true,
			country: 'Ethiopia'
		};

		test('should return predictions array with correct length', () => {
			const predictions = predictUnitCostFixed(mockInputs, samplesFixed, countries);
			expect(Array.isArray(predictions)).toBe(true);
			expect(predictions.length).toBe(samplesFixed.length);
		});

		test('should return positive cost predictions', () => {
			const predictions = predictUnitCostFixed(mockInputs, samplesFixed, countries);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
				expect(typeof pred).toBe('number');
			});
		});

		test('should return positive cost predictions for extended model', () => {
			const predictions = predictUnitCostFixed(mockInputs, samplesFixedExtended, countries, true);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
				expect(typeof pred).toBe('number');
			});
		});

		test('should handle unknown country', () => {
			const inputsUnknownCountry = { ...mockInputs, fc_country: 'Unknown' };
			const predictions = predictUnitCostFixed(inputsUnknownCountry, samplesFixed, countries);
			expect(predictions.length).toBe(samplesFixed.length);
			predictions.forEach(pred => {
				expect(pred).toBeGreaterThan(0);
			});
		});

		test("predictions match R package", async () => {
			for (let i = 0; i < testInputs.length; i++) {
				const preparedInputs = prepareInputs({
					...testInputs[i],
					country: testInputs[i].fc_country,
					visit_type: testInputs[i].output,
					publicFacility: testInputs[i].public
				},
					centering);
				const pred = summarizePredictions(predictUnitCostFixed(preparedInputs, samplesFixed, countries));
				expect(pred.mean).toBeCloseTo(testResultsFixed[i].Mean, 0);
				expect(pred.lower).toBeCloseTo(testResultsFixed[i].CI_low, 0);
				expect(pred.upper).toBeCloseTo(testResultsFixed[i].CI_high, 0);
			}
		});
	});

	describe('summarizePredictions', () => {
		const mockPredictions = [1.0, 2.0, 3.0, 4.0, 5.0];

		test('should calculate correct summary statistics', () => {
			const summary = summarizePredictions(mockPredictions);

			expect(summary.mean).toBe(3);
			expect(summary.lower).toBe(1); // 2.5th percentile
			expect(summary.upper).toBe(5); // 97.5th percentile
			expect(summary.samples).toEqual(mockPredictions);
		});

		test('should handle single prediction', () => {
			const singlePrediction = [2.75];
			const summary = summarizePredictions(singlePrediction);

			expect(summary.mean).toBe(2.75);
			expect(summary.lower).toBe(2.75);
			expect(summary.upper).toBe(2.75);
		});
	});
});
