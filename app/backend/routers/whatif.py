from fastapi import APIRouter, Depends

from ..schemas import ErrorResponse, WhatIfIn, WhatIfOut
from ..services import Services
from .deps import svc

router = APIRouter(tags=["prediction"])


@router.post("/what-if", response_model=WhatIfOut, responses={400: {"model": ErrorResponse}, 422: {"model": ErrorResponse}})
def what_if(body: WhatIfIn, s: Services = Depends(svc)):
    return s.what_if(body.features, body.changes, body.focus)
