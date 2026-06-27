# v293 real Firebase two-access regression harness

## What was attempted here

I attempted to connect from this execution container to the configured Firebase Realtime Database:

`https://dqr-sample-default-rtdb.firebaseio.com`

Result:

```json
{
  "ok": false,
  "tries": 4,
  "error": "URLError: <urlopen error [Errno -3] Temporary failure in name resolution>"
}
```

Because DNS resolution failed in this container, the real Firebase browser run could not be performed here.

## What v293 adds

v293 adds an actual Firebase two-access regression harness:

- `window.__DQR_TEST__.v293Firebase`
- `tools/v293_real_firebase_two_access_regression.py`

The script serves this project locally, launches two independent headless Chromium clients, loads the actual app with the actual Firebase SDK, signs in anonymously, joins both clients into the same Firebase room, and tests card use / board sync / damage sync / turn handoff through Firebase instead of a local bridge.

## How to run in a networked environment

```bash
cd /path/to/dqr_v293
python3 tools/v293_real_firebase_two_access_regression.py --connect-timeout 300 --firebase-timeout 300 --max-cases 80
```

For a longer run:

```bash
python3 tools/v293_real_firebase_two_access_regression.py --connect-timeout 600 --firebase-timeout 600 --max-cases 240
```

The script writes results to:

- `data/v293_real_firebase_two_access_regression_tests.json`

## Safety

The helpers are under `__DQR_TEST__` and are inert during normal UI play.
