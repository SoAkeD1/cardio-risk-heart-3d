"""Read-only contract files for the frontend (names, styles, tooltips, modifiable features, viewer look)."""
from fastapi import APIRouter, Depends

from ..services import Services
from .deps import svc

router = APIRouter(tags=["meta"])


@router.get("/anatomy-map")
def anatomy_map(s: Services = Depends(svc)) -> dict:
    return {k: v for k, v in s.amap.items() if not k.startswith("_")}


@router.get("/viewer-look")
def viewer_look(s: Services = Depends(svc)) -> dict:
    return s.viewer_look
