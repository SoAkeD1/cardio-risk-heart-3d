"""Pydantic v2 request/response models: the single source of the OpenAPI contract (and of the generated
TypeScript types in app/frontend/src/api/types.gen.ts)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Target = Literal["cad", "lad", "lcx", "rca"]
Vessel = Literal["lad", "lcx", "rca"]
FeatureValue = float | int | str | bool | None


# ----------------------------------------------------------------------------- errors
class ErrorBody(BaseModel):
    code: str
    message: str
    fields: dict[str, str] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# ----------------------------------------------------------------------------- health / schema
class Health(BaseModel):
    status: Literal["ok"]
    models: dict[str, str]
    vessel_strategy: str
    loaded_at: str
    load_ms: float
    version: str
    disclaimer: str


class EducationItem(BaseModel):
    key: str
    features: list[str]
    title: str
    text: str
    source: str
    url: str


class Education(BaseModel):
    title: str
    label: str
    note: str
    items: list[EducationItem]


class Group(BaseModel):
    key: str
    label: str
    order: int


class FeatureSpec(BaseModel):
    name: str
    original_name: str
    label: str
    group: str
    type: Literal["numeric", "binary", "ordinal", "categorical"]
    unit: str
    min: float | None = None
    max: float | None = None
    hard_min: float | None = None
    hard_max: float | None = None
    step: float | None = None
    default: FeatureValue
    allowed_values: list[str | int] | None = None
    value_labels: dict[str, str] | None = None
    normal_range: list[float] | None = None
    modifiable: bool
    used_by_model: bool
    help: str
    effect_strength: int | None = Field(None, description="0-3: how much this input can move the model's estimates "
                                       "(artifacts/feature_response.json)")
    effect_max_pts: dict[str, float] | None = None


class SchemaResponse(BaseModel):
    groups: list[Group]
    features: list[FeatureSpec]


class Example(BaseModel):
    id: str
    title: str
    subtitle: str
    features: dict[str, FeatureValue]
    true_labels: dict[str, bool]
    featured: bool = False


class ExamplesResponse(BaseModel):
    examples: list[Example]
    note: str


# ----------------------------------------------------------------------------- prediction
class PatientIn(BaseModel):
    features: dict[str, FeatureValue] = Field(default_factory=dict)


class PredictIn(PatientIn):
    k: int = Field(8, ge=1, le=55)
    focus: Target = "cad"
    show_territories: bool = False


class TargetPrediction(BaseModel):
    prob: float
    threshold: float
    label: str
    risk_tier: Literal["Low", "Moderate", "High"] | None = None


class Contribution(BaseModel):
    feature: str
    label: str
    group: str
    value: FeatureValue
    unit: str
    shap: float
    contribution_pct: float
    direction: str


class Prediction(BaseModel):
    cad: TargetPrediction
    lad: TargetPrediction
    lcx: TargetPrediction
    rca: TargetPrediction
    expected_stenotic_vessels: float
    explanations: dict[str, list[Contribution]]
    group_contributions: dict[str, dict[str, float]]
    warnings: list[str]
    disclaimer: str


class SceneMesh(BaseModel):
    color: str
    opacity: float
    emissive: float
    pulse_hz: float
    flagged: bool
    target: str | None
    outline_color: str | None
    badge: str | None
    visible: bool
    tooltip: str


class Driver(BaseModel):
    label: str
    value: FeatureValue
    unit: str
    contribution_pct: float
    direction: str


class SceneVessel(BaseModel):
    prob: float
    threshold: float
    flagged: bool
    label: str
    color: str
    badge: str | None
    reliability: str
    holdout_auc: float
    top_drivers: list[Driver]
    tooltip: str
    display_name: str
    camera_anchor: str
    mesh_names: list[str]


class SceneHeart(BaseModel):
    cad_prob: float
    threshold: float
    label: str
    risk_tier: Literal["Low", "Moderate", "High"]
    expected_stenotic_vessels: float
    reliability: str
    holdout_auc: float
    tooltip: str
    camera_anchor: str


class SceneRegion(BaseModel):
    region: str
    display_name: str
    mesh_names: list[str]
    camera_anchor: str
    intensity: float
    net_shap: float
    direction: Literal["raises", "lowers"]
    color: str
    icon: str
    features: list[str]
    tooltip: str


class LegendStop(BaseModel):
    p: float
    color: str


class SceneLegend(BaseModel):
    stops: list[LegendStop]
    meaning: str
    threshold_markers: dict[str, float]
    reliability_cutoffs: dict[str, float]
    risk_tiers: list[str]


class Scene(BaseModel):
    version: str
    target_focus: Target
    focus_camera_anchor: str
    show_territories: bool
    meshes: dict[str, SceneMesh]
    vessels: dict[str, SceneVessel]
    heart: SceneHeart
    regions: list[SceneRegion]
    legend: SceneLegend
    warnings: list[str]
    disclaimer: str


class PredictOut(BaseModel):
    prediction: Prediction
    contributions: dict[str, list[Contribution]] = Field(
        description="All raw-feature contributions per target (for 'Show all features' and the measurement table)")
    scene: Scene
    summary_text: str
    resolved_features: dict[str, FeatureValue]
    warnings: list[str]
    disclaimer: str
    latency_ms: float


class WhatIfIn(PatientIn):
    changes: dict[str, FeatureValue]
    focus: Target = "cad"


class WhatIfOut(BaseModel):
    before: Prediction
    after: Prediction
    delta: dict[str, float]
    scene_after: Scene
    derived_updates_applied: dict[str, FeatureValue]
    applied_changes: dict[str, FeatureValue]
    tier_change: list[str]
    note: str
    disclaimer: str
    latency_ms: float


class SensitivityIn(PatientIn):
    feature: str
    n: int = Field(15, ge=3, le=60)


class SensitivityPoint(BaseModel):
    value: float
    cad: float
    lad: float
    lcx: float
    rca: float


class SensitivityOut(BaseModel):
    feature: str
    label: str
    unit: str
    points: list[SensitivityPoint]
    current_value: float
    note: str
    disclaimer: str
    latency_ms: float


# ----------------------------------------------------------------------------- model card
class MetricCI(BaseModel):
    value: float
    ci_low: float
    ci_high: float


class TargetCard(BaseModel):
    key: Target
    label: str
    model: str
    strategy: str | None
    calibration: str | None
    holdout: dict[str, MetricCI]
    nested_cv: dict[str, float]
    threshold: float
    threshold_rule: str
    reliability_badge: str
    top_drivers: list[str]
    positive_label: str
    negative_label: str


class Figure(BaseModel):
    title: str
    path: str


class Attribution(BaseModel):
    what: str
    text: str
    url: str | None = None
    license: str


class ModelCard(BaseModel):
    dataset_citation: str
    n_patients: int
    n_holdout: int
    single_centre: bool
    validation: dict[str, str | float | int]
    targets: list[TargetCard]
    risk_tiers: dict[str, float | str]
    reliability_cutoffs: dict[str, float]
    calibration: list[dict[str, str | float]]
    limitations: list[str]
    figures: list[Figure]
    attributions: list[Attribution]
    disclaimer: str
