// Registers platform readers beyond the generic one. Imported once by every entry point
// (CLI, API routes, tests that need them).
import { registerReader } from "./index";
import { legistarReader } from "./legistar";
import { civicclerkReader } from "./civicclerk";

registerReader("legistar", legistarReader);
registerReader("civicclerk", civicclerkReader);
