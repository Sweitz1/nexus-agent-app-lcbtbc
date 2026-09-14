"""
Upload NexusLLM to HuggingFace Hub.

Usage:
    huggingface-cli login            # authenticate first
    python upload_hf.py --model ./nexus-llm-merged --repo your-username/nexus-llm
"""

import os
import argparse
from pathlib import Path


def upload_model(
    model_path: str,
    repo_id: str,
    private: bool = False,
    token: str | None = None,
):
    from huggingface_hub import HfApi, create_repo

    api = HfApi(token=token or os.getenv("HF_TOKEN"))

    # Create repo if it doesn't exist
    print(f"Creating repo: {repo_id}")
    try:
        create_repo(repo_id, private=private, token=token, exist_ok=True)
        print(f"✓ Repo ready: https://huggingface.co/{repo_id}")
    except Exception as e:
        print(f"Repo creation warning: {e}")

    # Upload the model directory
    model_path = Path(model_path)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    print(f"\nUploading {model_path} to {repo_id}...")
    print("This may take a while for large models.\n")

    api.upload_folder(
        folder_path=str(model_path),
        repo_id=repo_id,
        repo_type="model",
        commit_message="Upload NexusLLM merged model",
        token=token,
    )

    print(f"\n✓ Upload complete!")
    print(f"   View: https://huggingface.co/{repo_id}")
    print(f"\nUse it:")
    print(f"   from transformers import pipeline")
    print(f"   pipe = pipeline('text-generation', model='{repo_id}', device_map='auto')")
    print(f"   print(pipe('def hello():')[0]['generated_text'])")


def download_model(repo_id: str, output_path: str, token: str | None = None):
    """Download a model from HuggingFace Hub."""
    from huggingface_hub import snapshot_download

    print(f"Downloading {repo_id} to {output_path}...")
    snapshot_download(
        repo_id=repo_id,
        local_dir=output_path,
        token=token or os.getenv("HF_TOKEN"),
        ignore_patterns=["*.msgpack", "*.h5", "flax_model*"],
    )
    print(f"✓ Downloaded to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Upload NexusLLM to HuggingFace")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Upload
    up = subparsers.add_parser("upload", help="Upload model to HuggingFace")
    up.add_argument("--model", required=True, help="Local model directory")
    up.add_argument("--repo", required=True, help="HuggingFace repo (username/model-name)")
    up.add_argument("--private", action="store_true", help="Make the repo private")
    up.add_argument("--token", default=None, help="HF token (or set HF_TOKEN env var)")

    # Download
    dl = subparsers.add_parser("download", help="Download model from HuggingFace")
    dl.add_argument("--repo", required=True, help="HuggingFace repo to download")
    dl.add_argument("--output", required=True, help="Local path to save the model")
    dl.add_argument("--token", default=None)

    args = parser.parse_args()

    if args.command == "upload":
        upload_model(args.model, args.repo, args.private, args.token)
    elif args.command == "download":
        download_model(args.repo, args.output, args.token)


if __name__ == "__main__":
    main()
