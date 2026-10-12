from fastapi import APIRouter, Depends

from ..schemas import ErrorResponse, SensitivityIn, SensitivityOut
from ..services import Services
from .deps import svc

router = APIRouter(tags=["prediction"])


@router.post("/sensitivity", response_model=SensitivityOut,
             responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def sensitivity(body: SensitivityIn, s: Services = Depends(svc)):
    return s.sensitivity(body.features, body.feature, body.n)
