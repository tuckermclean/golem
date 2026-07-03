output "cdn_domain" {
  value = aws_cloudfront_distribution.cdn.domain_name
}

output "cdn_distribution_id" {
  value = aws_cloudfront_distribution.cdn.id
}

output "gha_role_arn" {
  value = aws_iam_role.gha.arn
}

output "corpus_bucket" {
  value = aws_s3_bucket.corpus.bucket
}

output "models_bucket" {
  value = aws_s3_bucket.models.bucket
}

output "site_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "trainer_launch_template_id" {
  value = aws_launch_template.trainer.id
}
