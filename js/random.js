export function sfc32(a, b, c, d) {
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
export function normalRandom(mean, sd, rand) {
	let u = 0, v = 0;
	while (u === 0) u = rand(); // Converting [0,1) to (0,1)
	while (v === 0) v = rand();
	let z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	return z * sd + mean;
}
