{
  "$schema": "../../ScenarioSimulator/schemas/config.schema.json",
  "name": "__NAME__",
  "scenario": {
    "globals": [],
    "logic": ["../source/__NAME__.js"]
  },
  "tests": ["*.test.js"],
  "execution": {
    "timeoutMs": 5000,
    "strictMode": "es5+",
    "encoding": "utf-8",
    "isolation": "per-test"
  }
}
