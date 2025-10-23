import { sfc32, normalRandom } from '../js/random.js';

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
