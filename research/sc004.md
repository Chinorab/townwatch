# SC-004 measurement (2026-10-08)

Zero configuration: each county is given by name only. Success = at least one agenda item of the county's
main governing body is read. Sample: Wasco County, OR (demo place) and 10 counties taken
every 12 rows from the 123 Medill 2025 news-desert counties of 5,000+ people
(Alaska boroughs excluded).

| County | Success | Main body source | Bodies covered | Items | Time | Model cost |
|---|---|---|---|---|---|---|
| Wasco County, OR | yes | www.wascocountyor.gov | county_executive, school_board | 31 items, 8 explained | 27 s | $0.001 |
| Asotin County, WA | yes | www.asotincountywa.gov | county_executive | 32 items, 4 explained | 21 s | $0.001 |
| Caroline County, VA | yes | co.caroline.va.us | county_executive | 3 items, 0 explained | 21 s | $0.001 |
| Cumberland County, VA | yes | www.cumberlandcounty.virginia.gov | county_executive, planning | 30 items, 8 explained | 25 s | $0.001 |
| Franklin County, AR | no | none | none | 0 items, 0 explained | 42 s | $0.000 |
| Hartley County, TX | no | none | none | 0 items, 0 explained | 28 s | $0.000 |
| Lincoln County, CO | no | none | none | 0 items, 0 explained | 21 s | $0.001 |
| Montgomery County, GA | no | none | none | 0 items, 0 explained | 16 s | $0.000 |
| Powell County, KY | no | none | school_board | 3 items, 0 explained | 21 s | $0.001 |
| Sussex County, VA | no | none | none | 0 items, 0 explained | 21 s | $0.001 |
| Vernon Parish, LA | no | none | none | 0 items, 0 explained | 16 s | $0.001 |


Total model spend: $0.006.

## History of this measurement (same 11 counties, 2026-10-08)

| Run | Result | What changed before the run |
|---|---|---|
| 1 | 2/11 | first version |
| 2 | 6/11 | CivicPlus dates and numbering, other-state domain rule (codes), alternate sources, agenda dedupe |
| 3 | 4/11 | state names spelled out in domains, letterhead check, month-only dates, parish bodies |
| 4 | 4/11 | other-county domains, `co`+state domains, state names of county bodies (Quorum Court...), main source shown |

Runs 2 and 3 counted at least one false success: Franklin County, AR was "read" from Franklin County,
Tennessee (`franklincotn.us`), because every search result for it belonged to another state. Run 4
shows the source of the main body, and each success above was checked by hand against the
county's own official site. Remaining failures: no findable online agenda (Hartley, TX; Franklin,
AR; Powell, KY), agendas only on yearly or JavaScript pages (Sussex, VA; Montgomery, GA), agendas
published as news posts with time slots (Lincoln, CO), and a parish whose agendas page belongs to
its tourism commission (Vernon Parish, LA).
