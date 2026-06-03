# Implementation rules

## Testing

- Core logic, application logic (including `flix/`), conformance work, and any other non-UI behavioral change: write a failing test that captures the expected (or corrected) behavior before you write, modify, or fix the implementation — including a regression test that reproduces a bug before you fix it. "Core logic" means any code whose behavior can be expressed as an assertion; default to this bucket unless the change is clearly UI/styling/static-config below.
- UI components, styling, and static configuration changes (config with no behavioral assertion to make): tests come after implementation but before commit. If a "configuration" change actually changes testable behavior, treat it as core logic above and test it first.
