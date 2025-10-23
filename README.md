# CAPTURETB Web ![Proof of Concept](https://img.shields.io/badge/status-proof%20of%20concept-orange)

A web application for generating TB outpatient unit cost predictions.

## Requirements
* [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/)

## Run locally

```
npm install # first time running the app
npm dev
```

## Model

This app uses the [capturetb](https://github.com/CAPTURE-TB-HIV/capturetb) econometric model to predict TB outpatient visit costs. Fitted posterior samples from the `capturetb` R package are converted to CSV format and stored in the `data/` directory via the `build_data.R` script. The web app then replicates the `capturetb$predict()` method in JavaScript to generate predictions based on user inputs.

## Test

Tests use [vitest](https://vitest.dev/).

```
npm test
```

To run with coverage:

```
npm run test:coverage
```

## Deploying

The app is built using [Vite](https://vite.dev/). To create a production build, run:

```
npm run build
```

This builds assets into the `dist` directory where they can be served by any static file server.
