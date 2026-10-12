# CardioLens: single-container build for judges.   docker build -t cardiolens . && docker run -p 8000:8000 cardiolens
FROM node:20-slim AS web
WORKDIR /src/app/frontend
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/frontend ./
COPY artifacts/heart.glb artifacts/heart_lite.glb /src/artifacts/
COPY assets_src/hdri /src/assets_src/hdri
RUN mkdir -p public/models public/env public/decoders/draco public/decoders/basis \
 && cp /src/artifacts/heart*.glb public/models/ && cp /src/assets_src/hdri/*.hdr public/env/ \
 && cp node_modules/three/examples/jsm/libs/draco/gltf/draco_* public/decoders/draco/ \
 && cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.* public/decoders/basis/ \
 && npx vite build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt pyproject.toml ./
COPY cardio_ml ./cardio_ml
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt && pip install --no-cache-dir -e .
COPY app ./app
COPY artifacts ./artifacts
COPY data ./data
COPY --from=web /src/app/frontend/dist ./app/frontend/dist
ENV CARDIOLENS_ENV=prod
EXPOSE 8000
CMD ["uvicorn", "app.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
