"""Download LTX models for local generation. Run via download.bat."""

import argparse
import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download

# Mirrors electron/app-paths.ts: %LOCALAPPDATA%\LTXDesktop\models
# Respects LTX_APP_DATA_DIR if set (advanced override)
_app_data = os.environ.get("LTX_APP_DATA_DIR") or \
    str(Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "LTXDesktop")
MODELS_DIR = Path(_app_data) / "models"

# (repo_id, filename, dest_name, is_folder)
REQUIRED = [
    ("Lightricks/LTX-2.3", "ltx-2.3-22b-distilled.safetensors", "ltx-2.3-22b-distilled.safetensors", False),
    ("Lightricks/LTX-2.3", "ltx-2.3-spatial-upscaler-x2-1.0.safetensors", "ltx-2.3-spatial-upscaler-x2-1.0.safetensors", False),
]

# Uncomment to enable depth/pose/canny control features:
OPTIONAL = [
    # ("Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control", "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", False),
    # ("Intel/dpt-hybrid-midas", None, "dpt-hybrid-midas", True),
    # ("hr16/yolox-onnx", "yolox_l.torchscript.pt", "yolox_l.torchscript.pt", False),
    # ("hr16/DWPose-TorchScript-BatchSize5", "dw-ll_ucoco_384_bs5.torchscript.pt", "dw-ll_ucoco_384_bs5.torchscript.pt", False),
    # ("Lightricks/gemma-3-12b-it-qat-q4_0-unquantized", None, "gemma-3-12b-it-qat-q4_0-unquantized", True),  # 25 GB — skip if using API text encoding
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_against_official(repo_id: str, filename: str, local_path: Path) -> None:
    print(f"  [...] Verifying checksum against huggingface.co ...")
    try:
        url = f"https://huggingface.co/api/models/{repo_id}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = json.load(resp)
        # s["oid"] is the Git object SHA — NOT the file content hash.
        # s["lfs"]["oid"] is the SHA256 of the actual file content (what we want).
        lfs_oid = next(
            (s["lfs"]["oid"] for s in data.get("siblings", [])
             if s["rfilename"] == filename and "lfs" in s),
            None
        )
        if lfs_oid is None:
            print(f"  [WARN] LFS metadata not found for {filename} — skipping checksum")
            return
        actual = sha256_file(local_path)
        if lfs_oid == actual:
            print(f"  [OK] Checksum verified")
        else:
            print(f"  [X] Checksum MISMATCH — file may be corrupt or mirror out of sync")
            print(f"       expected: {lfs_oid}")
            print(f"       got:      {actual}")
            sys.exit(1)
    except Exception as e:
        print(f"  [WARN] Could not reach huggingface.co for checksum ({e})")
        print(f"  [WARN] Skipping verification — manually verify if using a mirror")


def download_file(repo_id: str, filename: str, dest_name: str) -> None:
    dest = MODELS_DIR / dest_name
    if dest.exists():
        print(f"[OK] Already exists: {dest_name} — skipping")
        return
    print(f"[...] Downloading {filename} from {repo_id}")
    hf_hub_download(repo_id=repo_id, filename=filename, local_dir=MODELS_DIR, local_dir_use_symlinks=False)
    verify_against_official(repo_id, filename, dest)
    print(f"[OK] {dest_name}")


def download_snapshot(repo_id: str, dest_name: str) -> None:
    dest = MODELS_DIR / dest_name
    if dest.exists():
        print(f"[OK] Already exists: {dest_name} — skipping")
        return
    print(f"[...] Downloading snapshot {repo_id} → {dest_name}")
    snapshot_download(repo_id=repo_id, local_dir=dest, local_dir_use_symlinks=False)
    print(f"[OK] {dest_name} (snapshot — checksum skipped)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cn", action="store_true", help="Use hf-mirror.com (China)")
    args = parser.parse_args()

    if args.cn:
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        print("[...] Using mirror: https://hf-mirror.com")
    else:
        print("[...] Using: https://huggingface.co")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[...] Models directory: {MODELS_DIR}\n")

    for repo_id, filename, dest_name, is_folder in REQUIRED + OPTIONAL:
        if is_folder:
            download_snapshot(repo_id, dest_name)
        else:
            download_file(repo_id, filename, dest_name)

    print("\n[OK] Download complete. Run: launch.bat --local")


if __name__ == "__main__":
    main()
