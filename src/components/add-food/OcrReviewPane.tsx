import type { ComponentProps } from 'react'
import { LabelReviewSheet } from '../LabelReviewSheet'

export type OcrReviewPaneProps = ComponentProps<typeof LabelReviewSheet>

export function OcrReviewPane(props: OcrReviewPaneProps) {
  return (
    <div data-add-food-pane="ocr-review">
      <LabelReviewSheet {...props} />
    </div>
  )
}
