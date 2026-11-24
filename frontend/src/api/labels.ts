import type { Level, Topic } from './client'

/** Display names, as in docs/glossary.md. Typed as full records so a new level or topic fails the build. */
export const LEVEL_LABELS: Record<Level, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
}

export const TOPIC_LABELS: Record<Topic, string> = {
  rag_and_llm_apps: 'RAG & LLM apps',
  model_serving: 'Model serving',
  batch_vs_streaming_inference: 'Batch vs streaming inference',
  training_pipelines: 'Training pipelines',
  feature_stores: 'Feature stores',
  mlops_monitoring_and_drift: 'MLOps & monitoring/drift',
  data_pipelines: 'Data pipelines',
  recommender_systems: 'Recommender systems',
  ab_testing_and_experimentation: 'A/B testing & experimentation',
  privacy_and_security: 'Privacy & security',
}
