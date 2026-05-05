#!/bin/sh
apk add --no-cache git
rm -rf /workspace/Trade-dashboard
git clone --branch dashboard-merge https://github.com/riggy420/Trade-dashboard.git /workspace/Trade-dashboard
