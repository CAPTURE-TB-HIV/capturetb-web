import * as fs from "fs";
import * as path from "path";
import { processSamples, initApp } from "../js/main.js";
import centeringValues from "../data/centering_values.json";
const samplesCSV = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples.csv"), "utf8");
const samples = processSamples(samplesCSV);

const samplesCSVFixed = fs.readFileSync(path.join(__dirname, "../data", "posterior_samples_fixed.csv"), "utf8");
const samplesFixed = processSamples(samplesCSVFixed);

document.body.innerHTML = `
	<div id="loading"></div>
	<div id="app"></div>
	<div id="results"></div>
	<canvas id="costChart"></canvas>
	<form id="cost-form">
		<div class="row">
			<div class="col-md-6">
				<div class="mb-3">
					<label for="type" class="form-label">Visit type</label>
					<select class="form-select" id="type">
						<option value="op_treatmentvisit">Treatment</option>
						<option value="op_treatmentvisitLTBI">Treatment (LTBI)</option>
						<option value="op_treatmentvisitMDR">Treatment (MDR)</option>
					</select>
				</div>
				<div class="mb-3">
					<label for="building-space" class="form-label">
						Price of building space (USD/m²)
					</label>
					<input type="number" class="form-control" id="building-space" value="70" step="0.1" min="0">
					<div class="form-text">Local price of building space per square meter</div>
				</div>

				<div class="mb-3">
					<label for="total-visits" class="form-label">
						Annual outpatient visits (not just TB)
					</label>
					<input type="number" class="form-control" id="total-visits" value="40000" min="1">
					<div class="form-text">Total number of outpatient visits per year at facility</div>
				</div>

				<div class="mb-3">
					<label for="visits-per-fte" class="form-label">
						Daily TB outpatient visits per FTE working on TB
					</label>
					<input type="number" class="form-control" id="visits-per-fte" value="4" step="0.1" min="0">
					<div class="form-text">Average daily TB outpatient visits per FTE</div>
				</div>
			</div>

			<div class="col-md-6">
				<div class="mb-3">
					<label for="country" class="form-label">Country</label>
					<select class="form-select" id="country">
						<option value="Ethiopia">Ethiopia</option>
						<option value="Georgia">Georgia</option>
						<option value="India">India</option>
						<option value="Kenya">Kenya</option>
						<option value="Philippines">Philippines</option>
						<option value="Unknown">Other Country</option>
					</select>
				</div>

				<div class="mb-3">
					<label for="level" class="form-label">Health system level</label>
					<select class="form-select" id="level">
						<option value="other">Other</option>
						<option value="healthcentre">Healthcentre</option>
						<option value="primary">Primary hospital</option>
						<option value="secondary">Secondary hosptial</option>
						<option value="tertiary">Tertiary hospital</option>
					</select>
				</div>

				
				<div class="form-check">
					<input class="form-check-input" type="checkbox" value="" id="extended">
					<label class="form-check-label" for="extended">
						Include additional covariates: price of building space and TB visits per
						FTE per
						day
					</label>
				</div>

				<div class="mb-3">
					<label for="urban" class="form-label">Location</label>
					<select class="form-select" id="urban">
						<option value="urban" selected>Urban</option>
						<option value="rural">Rural</option>
					</select>
				</div>

				<div class="mb-3">
					<label for="public" class="form-label">Ownership</label>
					<select class="form-select" id="public">
						<option value="public" selected>Public</option>
						<option value="private">Private</option>
					</select>
					<div class="form-text">Privately owned includes non-profits</div>
				</div>
			</div>
		</div>
		<select class="form-select form-select-sm" id="confidence-level" style="width: auto;">
			<option value="95" selected>95% Confidence</option>
			<option value="80">80% Confidence</option>
		</select>
	 <div class="text-center">
			<button class="btn btn-primary btn-lg" id="submit-total">
				Predict Unit Cost
			</button>
			<button class="btn btn-primary btn-lg" id="submit-fixed">
				Predict Fixed Unit Cost
			</button>
			<button class="btn btn-primary btn-lg" id="submit-overhead">
				Predict Overhead Unit Cost
			</button>
	 </div>
	</form>
	<div id="predicted-cost"></div>
							<div class="card result-card mb-4">
							<div class="card-body">
								<h5 class="card-title" id="title"></h5>
								<div class="row align-items-center">
									<div class="col-md-6">
										<h2 class="text-primary mb-0" id="predicted-cost">$--</h2>
										<small class="text-muted">per outpatient visit</small>
									</div>
									<div class="col-md-6">
										<div class="mb-2">
											<div class="d-flex justify-content-between align-items-center">
												<span id="credible-interval-label">95% Credible Interval:</span>
												<span id="credible-interval">$-- - $--</span>
											</div>
										</div>
										<div class="d-flex justify-content-end">
											<select class="form-select form-select-sm" id="confidence-level" style="width: auto;">
												<option value="95" selected>95% Confidence</option>
												<option value="90">90% Confidence</option>
												<option value="80">80% Confidence</option>
											</select>
										</div>
									</div>
								</div>
							</div>
						</div>
`;

describe("capturetb integration", () => {

	beforeAll(() => {
		global.alert = vi.fn();
		global.posteriorSamples = samples.slice(0, 1000); // Use a subset for testing
		global.posteriorSamplesFixed = samplesFixed.slice(0, 1000); // Use a subset for testing
		global.centeringValues = centeringValues;
		initApp(null, () => { });
		vi.useFakeTimers()

	});

	beforeEach(() => {
		document.getElementById('loading').style.display = 'flex';
		document.getElementById('app').style.display = 'none';
		document.getElementById('results').style.display = 'none';
	});

	describe('Form Handling', () => {

		test("should return predictions", async () => {
			const btn = document.getElementById("submit-total")
			const evt = new Event("click", { bubbles: true, cancelable: true })
			btn.dispatchEvent(evt);
			expect(document.getElementById("predicted-cost").innerHTML).toBe("$7.79");
			expect(document.getElementById("title").innerHTML).toBe("Predicted Cost");
		});

		test("should return predictions for fixed costs", async () => {
			const btn = document.getElementById("submit-fixed")
			const evt = new Event("click", { bubbles: true, cancelable: true })
			btn.dispatchEvent(evt);
			vi.advanceTimersByTime(50);
			expect(document.getElementById("predicted-cost").innerHTML).toBe("$4.2");
			expect(document.getElementById("title").innerHTML).toBe("Predicted Fixed Cost");
		});

		test("can update confidence level", async () => {
			const btn = document.getElementById("submit-total")
			const evt = new Event("click", { bubbles: true, cancelable: true })
			btn.dispatchEvent(evt);

			expect(document.getElementById("predicted-cost").innerHTML).toBe("$7.79");

			vi.advanceTimersByTime(50);

			expect(document.getElementById("credible-interval-label").innerHTML).toBe("95% Credible Interval:");
			expect(document.getElementById("credible-interval").innerHTML).toBe("$1.78 - $22.15");

			// Change confidence level
			document.getElementById("confidence-level").value = "80";
			const changeEvent = new Event("change", { bubbles: true, cancelable: true });
			document.getElementById("confidence-level").dispatchEvent(changeEvent);
			vi.advanceTimersByTime(50);

			expect(document.getElementById("credible-interval-label").innerHTML).toBe("80% Credible Interval:");
			expect(document.getElementById("credible-interval").innerHTML).toBe("$2.73 - $14.09");
		}, 10000);

	});

});
