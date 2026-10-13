# CardioLens demo: narration script

Machine-readable: `video/pipeline/tts.py` parses this file. One `##` block per scene.
- `chapter`, `visual` (which capture or card the editor shows), `lead` (seconds of picture before the voice starts),
  `tail` (seconds held after the voice ends).
- `[[name]]` is replaced by a measured number from `video/facts.json`.
- Lines starting with `> ` are spoken. `{name}` marks a **cue**: the capture script performs its action at the moment
  the narrator reaches that word, so picture and voice stay in sync. Cues are removed from the spoken text.
- Style: plain, calm, ~145 words per minute. Requirement numbers refer to the Track A problem statement.

## s00_cold · Cold open
- chapter: 0
- visual: capture:s00_cold
- lead: 4.6
- tail: 1.4

> This is CardioLens. {colour}Routine clinical data goes in, and a 3D heart shows where coronary risk is likely to be, artery by artery.

## s01_problem · The problem
- chapter: 1
- visual: card:problem
- lead: 0.6
- tail: 0.8

> Cardiovascular disease remains a leading cause of death worldwide, and a narrowed coronary artery is usually confirmed by angiography, an invasive test.
> {goal}Track A asks a different question: can routine data, such as age, blood pressure, an ECG and a few lab values, predict coronary artery disease and the narrowing of each main artery, and show it on an interactive 3D model?
> {table}Here is every requirement, and where CardioLens meets it.

## s05a_open · Opening and tour
- chapter: 2
- visual: capture:s05a_open
- lead: 1.0
- tail: 2.4

> Now, the app itself. On a first visit it opens with a short intro, then a three-step tour of where to start, which you can skip, and it's remembered after that.

## s05b_samples · Sample patients
- chapter: 2
- visual: capture:s05b_samples
- lead: 0.6
- tail: 2.3

> Sample patients are one click away: six real hold-out patients, from clearly low risk to a deliberate uncertainty example.
> {pick}Each one also has its own link.

## s05c_panel · Patient input
- chapter: 2
- visual: capture:s05c_panel
- lead: 0.6
- tail: 1.9

> You can also enter your own patient. The form is generated from the API schema: grouped, searchable, and showing how many fields changed.
> {field}Each field has a typical range, a help note, and an effect meter showing how much it can move the estimates.
> {alt}Alt-click resets a single field, and a full reset can be undone.

## s05d_live · Live change feedback
- chapter: 2
- visual: capture:s05d_live
- lead: 0.6
- tail: 2.4

> Every change updates the estimate live.
> {htn}Switch hypertension off, and a toast reports exactly what moved: CAD down 21 points.
> {smoke}Make the patient a smoker, and a chip links the change to the lungs.
> {murmur}And when an input barely matters, the app says so.

## s05e_changed · What changed
- chapter: 2
- visual: capture:s05e_changed
- lead: 0.4
- tail: 2.0

> The What changed panel lists every edit, and any of them can be reverted.

## s05f_3d · 3D interaction
- chapter: 2
- visual: capture:s05f_3d
- lead: 0.6
- tail: 2.3

> Now the 3D view, requirement 2. Rotate, zoom, and hover an artery to see its probability, threshold and reliability.
> {click}Click it, and the camera flies there. The card and the explanation follow the selection.
> {lm}The left main says plainly: not modelled.

## s05g_views · Views and looks
- chapter: 2
- visual: capture:s05g_views
- lead: 0.4
- tail: 1.9

> There are view presets, {look}a realistic or clinical look, {beat}a gentle heartbeat, and a turntable.
> {legend}The legend marks each artery's threshold on the colour scale.
> {tools}Reset, full screen, a screenshot button, and an automatic quality switch are always at hand.

## s05h_body · Body mode and territories
- chapter: 2
- visual: capture:s05h_body
- lead: 0.4
- tail: 2.3

> Body mode places the heart in a torso, with an x-ray slider, and highlights where contributing factors live.
> {terr}Territories show what each artery typically supplies.

## s05i_why · Why?
- chapter: 2
- visual: capture:s05i_why
- lead: 0.4
- tail: 2.1

> Why is requirement 3b: a SHAP waterfall in probability points, for CAD and for each artery.
> {table}The breakdown groups the reasons, and the table puts each measurement beside its typical range and contribution. That's 3c.

## s05j_whatif · What-if
- chapter: 2
- visual: capture:s05j_whatif
- lead: 0.4
- tail: 2.5

> What-if changes only modifiable factors.
> {set}Lower LDL, lower blood pressure, stop smoking, and the table shows before and after.
> {show}Show on heart previews the colours, and holding compares with the original.
> {sens}A sensitivity chart sweeps one factor across its range.

## s05k_modelcard · Model card
- chapter: 2
- visual: capture:s05k_modelcard
- lead: 0.4
- tail: 2.1

> The model card is our honesty page: hold-out metrics with intervals, validation, thresholds, calibration, and limitations.
> {outcomes}It also shows how each sample patient actually turned out.

## s05l_export · Export
- chapter: 2
- visual: capture:s05l_export
- lead: 0.4
- tail: 2.5

> Export a PDF report, with the disclaimer on every page, {copy}copy a plain summary, or save a screenshot.

## s05m_edu · Education and theme
- chapter: 2
- visual: capture:s05m_edu
- lead: 0.4
- tail: 2.1

> An optional education card explains risk factors in general, with sources, and never changes the heart.
> {light}There's a light theme too.

## s05n_devices · Tablet and phone
- chapter: 2
- visual: capture:s05n_devices
- lead: 0.4
- tail: 2.7

> It adapts to tablets {phone}and phones, and loads a lighter model automatically on weaker devices.

## s05o_offline · Offline and shortcuts
- chapter: 2
- visual: capture:s05o_offline
- lead: 0.4
- tail: 1.6

> If the server drops, a banner explains it, the last result stays, and the app reconnects by itself.
> {keys}And every shortcut is one key away.

## s02a_data · Dataset and leakage rule
- chapter: 3
- visual: card:data
- lead: 0.4
- tail: 0.6

> We used the extension of the Z-Alizadeh Sani dataset from UCI: 303 patients, 55 features, and four targets: CAD, plus the LAD, LCX and RCA arteries.
> {audit}No values were missing, and a constant column was dropped.
> {leak}The label columns are never model inputs. That's asserted before every fit, and the API rejects them: requirement 1d.

## s02b_validation · Features and validation
- chapter: 3
- visual: card:validation
- lead: 0.3
- tail: 0.6

> We add clinical features, such as a pretest probability, kidney function and lipid ratios.
> {holdout}Twenty percent of patients are held out until the very end.
> {cv}The rest go through five-by-five cross-validation with nested tuning, {ci}and confidence intervals come from a thousand bootstrap resamples.

## s02c_models · Models, strategies, calibration
- chapter: 3
- visual: card:models
- lead: 0.3
- tail: 0.6

> Nine model families were compared for every target, from logistic regression to boosting and stacked ensembles.
> {strategy}For the arteries, independent models did as well as chained or hierarchical ones, so we kept the simplest.
> {calib}Every model is calibrated, so eighty percent means about eight in ten, with tuned thresholds and three risk tiers.

## s02d_results · Results and explanations
- chapter: 3
- visual: card:results
- lead: 0.3
- tail: 0.8

> On the untouched hold-out set, the ROC-AUC is 0.895 for CAD, 0.832 for LAD, 0.768 for LCX and 0.741 for RCA, with confidence intervals and every metric from requirement 1e.
> {shap}Each estimate is explained with exact SHAP values, mapped back to the raw measurements, {latency}in about 150 milliseconds.

## s03a_mapping · From probability to picture
- chapter: 4
- visual: card:mapping
- lead: 0.4
- tail: 0.6

> How does a probability become a picture? One anatomy map holds every mesh name, colour and label, and a pure function turns each prediction into a render-ready scene.
> {scale}Colour shows probability, on one shared scale that is safe for colour-blind viewers.
> {flag}Crossing a threshold adds an outline and a pulse, and every estimate carries a reliability badge.

## s03b_rules · No over-claiming
- chapter: 4
- visual: card:rules
- lead: 0.3
- tail: 0.8

> The data says whether an artery is narrowed, but not where. So whole arteries are coloured, and unlabelled branches stay neutral.
> {overlays}Optional overlays show perfusion territories, and the body regions behind each risk factor, never the disease itself.
> {whatif}And what-if shows associations, not treatment effects.

## s04a_source · The heart model
- chapter: 5
- visual: card:heart_source
- lead: 0.4
- tail: 0.6

> Building the heart. Our first version was a procedural heart, which is still kept as a fallback.
> {sketchfab}For realism, we moved to the Realistic Human Heart by neshallads on Sketchfab, under CC BY 4.0. A headless Blender script aligns it, scales it to twelve centimetres, and splits it into parts.

## s04b_build · Vessels and budgets
- chapter: 5
- visual: card:heart_build
- lead: 0.3
- tail: 0.5

> Its coronaries were only painted on, so we traced them along the grooves, smoothed them, and swept them into real tubes.
> {looks}One file carries a realistic and a clinical look, plus invisible picking shapes and outline shells.
> {lite}It's compressed to about 1.6 megabytes, with a lighter version for phones, and a validator checks every name and budget.

## s06a_arch · Architecture
- chapter: 6
- visual: card:architecture
- lead: 0.4
- tail: 0.8

> Under the hood: the frozen ML package feeds the anatomy layer, a FastAPI service exposes ten endpoints with one error shape, and React Three Fiber binds the scene to the heart.
> {guard}The frontend holds no clinical data of its own. A guard script fails the build if it ever does.

## s06b_quality · Quality
- chapter: 6
- visual: card:quality
- lead: 0.4
- tail: 0.8

> Everything is tested: 49 Python tests, 22 unit tests, and [[e2e_count]] browser tests, including one that checks every artery's rendered colour against the API.
> {numbers}Accessibility scans find no serious issues, the viewer runs near 60 frames per second, and Lighthouse scores [[lh_perf]] for performance and 100 for accessibility.

## s06c_deploy · Deployment
- chapter: 6
- visual: capture:s06c_deploy
- lead: 0.6
- tail: 1.0

> It's live on Vercel, at havoc-rho dot vercel dot app.
> {other}It also runs in Docker, from a one-click Windows launcher, and everything rebuilds from one command.

## s07_close · Limits and close
- chapter: 7
- visual: card:close
- lead: 0.4
- tail: 6.0

> Finally, the limits. This is one hospital's data, 303 patients, with no external validation and no lesion location, and the RCA model is only of limited reliability.
> {disc}CardioLens is for decision support and education only. It is not a substitute for diagnostic imaging or clinical judgement.
> {credits}Thanks to the dataset authors, to neshallads for the heart, and to Poly Haven. From Team HAVOC, thank you.
