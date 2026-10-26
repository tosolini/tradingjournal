FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_SYSTEM_PYTHON=1

# Layer 1: dependencies (cached unless pyproject.toml changes)
COPY pyproject.toml /app/
RUN uv pip install --no-cache -r pyproject.toml --extra dev

# Layer 2: application source code
COPY . /app
RUN uv pip install --no-cache --no-deps -e .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--no-access-log"]
