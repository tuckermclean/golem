variable "region" {
  type    = string
  default = "us-west-2"
}

variable "name_prefix" {
  type    = string
  default = "golem"
}

variable "github_repo" {
  description = "owner/repo allowed to assume the CI role via OIDC"
  type        = string
}

variable "repo_url" {
  description = "clone URL baked into the trainer's user-data"
  type        = string
}

variable "trainer_instance_type" {
  type    = string
  default = "g5.xlarge" # 1x A10G, plenty for a 15M model
}

variable "max_train_hours" {
  description = "hard shutdown guard for the ephemeral trainer"
  type        = number
  default     = 12
}
