# CaptureTB Web App [![🔎 Test](https://github.com/CAPTURE-TB-HIV/capturetb-web/actions/workflows/test.yaml/badge.svg)](https://github.com/CAPTURE-TB-HIV/capturetb-web/actions/workflows/test.yaml) [![codecov](https://codecov.io/gh/CAPTURE-TB-HIV/capturetb-web/graph/badge.svg?token=LZxkUrw0V3)](https://codecov.io/gh/CAPTURE-TB-HIV/capturetb-web) ![GitHub License](https://img.shields.io/github/license/CAPTURE-TB-HIV/capturetb-web) ![GitHub package.json version](https://img.shields.io/github/package-json/v/CAPTURE-TB-HIV/capturetb-web)

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

Tests use [Vitest](https://vitest.dev/).

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
