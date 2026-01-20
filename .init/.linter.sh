#!/bin/bash
cd /home/kavia/workspace/code-generation/premier-car-dealership-landing-page-309766-309775/car_dealership_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

