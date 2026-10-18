import test from "node:test";
import assert from "node:assert/strict";

import { detectIntent, extractLocation, extractDays, extractCategories } from "../src/services/assistant/nlu";
import { normaliseHistory } from "../src/services/assistant/history";

test("intent detection", () => {
  const cases: Array<[string, string]> = [
    ["Help! someone is following me", "emergency"],
    ["I was robbed near the station", "emergency"],
    ["I lost my passport", "lost"],
    ["Someone scammed me on UPI", "lost"],
    ["Is Police Bazaar safe at night?", "safety"],
    ["how safe is this area", "safety"],
    ["Plan 2 days in Jaipur", "plan"],
    ["plan a weekend in Gangtok with food", "plan"],
    ["What's on my itinerary?", "my_itinerary"],
    ["Add Red Fort to my itinerary tomorrow", "add_itinerary"],
    ["Recommend historic places near me", "recommend"],
    ["where can I eat momos in Gangtok", "recommend"],
    ["nearest hospital", "nearby_help"],
    ["emergency numbers", "emergency"], // safety-first: 'emergency' always wins
    ["what is the women helpline number", "numbers"],
    ["how do I file an e-FIR", "app_help"],
    ["any safety tips?", "tips"],
    ["hello", "greeting"],
    ["thanks!", "thanks"],
    ["Birla planetarium timings in Chennai", "recommend"],
    ["asdfgh", "unknown"],
  ];
  for (const [text, want] of cases) assert.equal(detectIntent(text), want, text);
});

test("help me plan is not treated as an emergency", () => {
  assert.equal(detectIntent("help me plan a trip to Shillong"), "plan");
});

test("location extraction", () => {
  assert.equal(extractLocation("Plan 2 days in Jaipur"), "Jaipur");
  assert.equal(extractLocation("historic places in New Delhi please"), "New Delhi");
  assert.equal(extractLocation("Is Police Bazaar safe? I'm at Police Bazaar, Shillong"), "Police Bazaar, Shillong");
  assert.equal(extractLocation("food near me"), null);
  assert.equal(extractLocation("Is Police Bazaar, Shillong safe at night?"), "Police Bazaar, Shillong");
  assert.equal(extractLocation("is mg marg safe"), "mg marg");
  assert.equal(extractLocation("is it safe here"), null);
  assert.equal(extractLocation("things to do in shillong tomorrow"), "shillong");
});

test("days + categories extraction", () => {
  assert.equal(extractDays("plan 3 days in Agra"), 3);
  assert.equal(extractDays("a 2-day trip"), 2);
  assert.equal(extractDays("weekend in Goa"), 2);
  assert.equal(extractDays("two days in Delhi"), 2);
  assert.equal(extractDays("plan Jaipur"), 1);
  assert.equal(extractDays("plan 30 days"), 7);
  const cats = extractCategories("history, street food and some nightlife");
  assert.ok(cats.includes("historic") && cats.includes("food") && cats.includes("entertainment"));
});

test("history normalisation", () => {
  const h = normaliseHistory([
    { role: "assistant", content: "Hi!" }, // dropped: must start with user
    { role: "user", content: "a" },
    { role: "user", content: "b" }, // merged with previous user turn
    { role: "system", content: "ignore me" }, // invalid role
    { role: "assistant", content: "  " }, // empty
    { role: "assistant", content: "ok" },
  ]);
  assert.deepEqual(h, [
    { role: "user", content: "a\n\nb" },
    { role: "assistant", content: "ok" },
  ]);
  assert.deepEqual(normaliseHistory("nope"), []);
  assert.equal(normaliseHistory([{ role: "user", content: "x".repeat(10000) }])[0]!.content.length, 4000);
});
