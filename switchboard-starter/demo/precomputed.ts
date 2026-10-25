/**
 * Saved Claude answers for the demo examples, keyed by discoveryKey(description).
 * Generated with `pnpm demo:precompute`, which calls the model for real and writes this file.
 * Only the model's reasoning is saved; Kalshi markets are looked up live on every request.
 */
import type { Discovery } from "./discover.js";

export const PRECOMPUTED: Record<string, { generatedAt: string; model: string; discovery: Discovery }> = {
  "ice cream shop in new york": {
    "generatedAt": "2026-10-25T16:43:45.486Z",
    "model": "claude-opus-5-5",
    "discovery": {
      "companyName": "Ice cream shop (New York)",
      "exposures": [
        {
          "label": "Rainy weekends and wet months",
          "description": "Rain kills walk-in foot traffic, especially on weekend evenings when most sales happen.",
          "category": "climate",
          "insight": "Owners think about cold, but a wet month can hurt more than a cool one because people simply don't walk past your window. A few rainy Saturdays can wipe out a big share of the month's profit.",
          "badOutcome": "NYC monthly rain above 5 inches",
          "direction": "above",
          "threshold": 5,
          "seriesTickers": [
            "KXRAINNYCM",
            "KXRAINDNYC",
            "KXRAINNYCW"
          ]
        },
        {
          "label": "Cool summer days",
          "description": "Daily highs below seasonal norms cut cone and pint sales sharply.",
          "category": "climate",
          "insight": "Sales fall off fast when the high drops below about 75°F. A cool stretch in June or August means lower sales while you still pay full staff and rent.",
          "badOutcome": "NYC daily high below 75°F",
          "direction": "below",
          "threshold": 75,
          "seriesTickers": [
            "KXHIGHNY",
            "KXWEEKHTNYC",
            "KXTEMPNYCH"
          ]
        },
        {
          "label": "Extreme heat straining freezers and power",
          "description": "Heat waves push freezers and compressors to failure and raise the risk of grid outages that melt inventory.",
          "category": "operational",
          "insight": "A very hot day sounds like a great sales day, but above about 97°F old freezers struggle and blackouts get more likely. One failure can spoil thousands of dollars of product overnight.",
          "badOutcome": "NYC daily high above 97°F",
          "direction": "above",
          "threshold": 97,
          "seriesTickers": [
            "KXHIGHNY",
            "KXHEATWARNING"
          ]
        },
        {
          "label": "Dairy and sugar cost spikes",
          "description": "Cream and butterfat prices swing and squeeze margins.",
          "category": "commodity",
          "insight": "Cream prices can jump 20–30% in a season, and most shops don't raise menu prices fast enough to keep up.",
          "badOutcome": "Wholesale cream prices spike",
          "direction": "above",
          "threshold": null,
          "seriesTickers": []
        }
      ],
      "scenarios": [
        {
          "label": "Normal month",
          "probability": 0.6,
          "lossUsd": 0,
          "exposureIndex": -1
        },
        {
          "label": "Very wet month with rainy weekends",
          "probability": 0.15,
          "lossUsd": 5000,
          "exposureIndex": 0
        },
        {
          "label": "Cool stretch in peak season",
          "probability": 0.15,
          "lossUsd": 4000,
          "exposureIndex": 1
        },
        {
          "label": "Heat wave freezer failure or outage",
          "probability": 0.05,
          "lossUsd": 7000,
          "exposureIndex": 2
        },
        {
          "label": "Dairy cost spike",
          "probability": 0.05,
          "lossUsd": 2500,
          "exposureIndex": 3
        }
      ]
    }
  }
};
