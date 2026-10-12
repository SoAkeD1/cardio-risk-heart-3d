from fastapi import APIRouter, Depends

from ..schemas import ErrorResponse, PredictIn, PredictOut
from ..services import Services
from .deps import svc

router = APIRouter(tags=["prediction"])
ERRORS = {400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}}


@router.post("/predict", response_model=PredictOut, responses=ERRORS)
def predict(body: PredictIn, s: Services = Depends(svc)):
    return s.predict(body.features, body.k, body.focus, body.show_territories)
