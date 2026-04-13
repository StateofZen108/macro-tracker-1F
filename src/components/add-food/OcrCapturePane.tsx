import type { ComponentProps } from 'react'
import { LabelCaptureSheet } from '../LabelCaptureSheet'

export type OcrCapturePaneProps = ComponentProps<typeof LabelCaptureSheet>

export function OcrCapturePane(props: OcrCapturePaneProps) {
  return (
    <div data-add-food-pane="ocr-capture">
      <LabelCaptureSheet {...props} />
    </div>
  )
}
