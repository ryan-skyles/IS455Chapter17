from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

SHOP_DB = PROJECT_ROOT / "shop.db"
WAREHOUSE_DB = PROJECT_ROOT / "data" / "warehouse.db"
ARTIFACT_DIR = PROJECT_ROOT / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "fraud_pipeline.joblib"
METADATA_PATH = ARTIFACT_DIR / "model_metadata.json"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
