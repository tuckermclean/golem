terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    # bootstrap this bucket once, out of band:
    #   aws s3 mb s3://golem-tfstate && aws dynamodb create-table ... (lock table)
    bucket         = "golem-tfstate"
    key            = "golem-pipeline/terraform.tfstate"
    region         = "us-west-2"
    dynamodb_table = "golem-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = "golem", managed_by = "terraform" }
  }
}

# ── Buckets ──────────────────────────────────────────────────────────────
# corpus:  training shards + quarantined (validator-rejected) pairs
# models:  checkpoints/ (transient) and released/ (immutable, CDN-served)
# site:    the static game bundle (html, wasm, manifest.json)

resource "aws_s3_bucket" "corpus" { bucket = "${var.name_prefix}-corpus" }
resource "aws_s3_bucket" "models" { bucket = "${var.name_prefix}-models" }
resource "aws_s3_bucket" "site"   { bucket = "${var.name_prefix}-site" }

resource "aws_s3_bucket_versioning" "models" {
  bucket = aws_s3_bucket.models.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_lifecycle_configuration" "corpus" {
  bucket = aws_s3_bucket.corpus.id
  rule {
    id     = "expire-quarantine"
    status = "Enabled"
    filter { prefix = "quarantine/" }
    expiration { days = 90 }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "models" {
  bucket = aws_s3_bucket.models.id
  rule {
    id     = "expire-transient-checkpoints"
    status = "Enabled"
    filter { prefix = "checkpoints/" }
    expiration { days = 30 } # released/ is never expired
  }
}

resource "aws_s3_bucket_public_access_block" "all" {
  for_each = { corpus = aws_s3_bucket.corpus.id, models = aws_s3_bucket.models.id, site = aws_s3_bucket.site.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── CloudFront: site at /, released weights at /weights/* ────────────────

resource "aws_cloudfront_origin_access_control" "oac" {
  name                              = "${var.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled             = true
  default_root_object = "golem-world.html"
  price_class         = "PriceClass_100"

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }
  origin {
    origin_id                = "models"
    domain_name              = aws_s3_bucket.models.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
    origin_path              = "/released"
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  # content-addressed weight files: cache forever at the edge
  ordered_cache_behavior {
    path_pattern           = "/weights/*"
    target_origin_id       = "models"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}

data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }

data "aws_iam_policy_document" "site_read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals { type = "Service", identifiers = ["cloudfront.amazonaws.com"] }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_read.json
}

data "aws_iam_policy_document" "models_read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.models.arn}/released/*"]
    principals { type = "Service", identifiers = ["cloudfront.amazonaws.com"] }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "models" {
  bucket = aws_s3_bucket.models.id
  policy = data.aws_iam_policy_document.models_read.json
}

# ── GitHub Actions OIDC: short-lived creds, no stored keys ───────────────

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_iam_policy_document" "gha_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
    }
  }
}

resource "aws_iam_role" "gha" {
  name               = "${var.name_prefix}-gha"
  assume_role_policy = data.aws_iam_policy_document.gha_trust.json
}

data "aws_iam_policy_document" "gha_perms" {
  statement {
    sid       = "Buckets"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:DeleteObject"]
    resources = [
      aws_s3_bucket.corpus.arn, "${aws_s3_bucket.corpus.arn}/*",
      aws_s3_bucket.models.arn, "${aws_s3_bucket.models.arn}/*",
      aws_s3_bucket.site.arn,   "${aws_s3_bucket.site.arn}/*",
    ]
  }
  statement {
    sid       = "Invalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.cdn.arn]
  }
  statement {
    sid = "EphemeralTrainer"
    actions = [
      "ec2:RunInstances", "ec2:TerminateInstances", "ec2:DescribeInstances",
      "ec2:CreateTags", "iam:PassRole",
    ]
    resources = ["*"] # tighten with condition keys on the golem tag in prod
  }
}

resource "aws_iam_role_policy" "gha" {
  name   = "gha-perms"
  role   = aws_iam_role.gha.id
  policy = data.aws_iam_policy_document.gha_perms.json
}

# ── Ephemeral spot GPU trainer ───────────────────────────────────────────
# The train workflow launches from this template; user-data clones the repo,
# trains, uploads checkpoint + metrics to s3://models/checkpoints/<run-id>/,
# then the instance terminates itself. Nothing GPU-shaped exists at idle.

resource "aws_iam_role" "trainer" {
  name = "${var.name_prefix}-trainer"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "trainer" {
  name = "trainer-s3"
  role = aws_iam_role.trainer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
      Resource = [
        aws_s3_bucket.corpus.arn, "${aws_s3_bucket.corpus.arn}/*",
        aws_s3_bucket.models.arn, "${aws_s3_bucket.models.arn}/*",
      ]
    }]
  })
}

resource "aws_iam_instance_profile" "trainer" {
  name = "${var.name_prefix}-trainer"
  role = aws_iam_role.trainer.name
}

data "aws_ami" "dlami" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["Deep Learning OSS Nvidia Driver AMI GPU PyTorch *Amazon Linux 2023*"]
  }
}

resource "aws_launch_template" "trainer" {
  name          = "${var.name_prefix}-trainer"
  image_id      = data.aws_ami.dlami.id
  instance_type = var.trainer_instance_type

  iam_instance_profile { name = aws_iam_instance_profile.trainer.name }

  instance_market_options {
    market_type = "spot"
    spot_options { instance_interruption_behavior = "terminate" }
  }

  # belt-and-braces cost guard: die after max_train_hours no matter what
  user_data = base64encode(<<-EOF
    #!/bin/bash
    set -euo pipefail
    shutdown -h +$(( ${var.max_train_hours} * 60 ))
    RUN_ID=$(cat /run/golem-run-id 2>/dev/null || echo "manual-$(date +%s)")
    cd /home/ec2-user
    git clone --depth 1 ${var.repo_url} golem && cd golem
    pip install -r train/requirements.txt
    python train/train.py \
      --corpus s3://${aws_s3_bucket.corpus.bucket}/shards/ \
      --out    s3://${aws_s3_bucket.models.bucket}/checkpoints/$RUN_ID/
    aws s3 cp train/DONE s3://${aws_s3_bucket.models.bucket}/checkpoints/$RUN_ID/DONE
    shutdown -h now
  EOF
  )

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name_prefix}-trainer", golem = "ephemeral" }
  }
}
