import { expect, test } from "bun:test";
import { z } from "zod";
import { parseJson } from "../src/json";

const Schema = z.object({ n: z.number() });

test("parseJson returns the parsed value, or null for missing, malformed or invalid input", () => {
  expect(parseJson(Schema, '{"n":1}')).toEqual({ n: 1 });
  expect(parseJson(Schema, null)).toBeNull();
  expect(parseJson(Schema, "{not json")).toBeNull();
  expect(parseJson(Schema, '{"n":"1"}')).toBeNull();
});
