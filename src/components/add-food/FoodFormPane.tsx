import type { ComponentProps } from 'react'
import { FoodForm } from '../FoodForm'

export type FoodFormPaneProps = ComponentProps<typeof FoodForm>

export function FoodFormPane(props: FoodFormPaneProps) {
  return (
    <div data-add-food-pane="food-form">
      <FoodForm {...props} />
    </div>
  )
}
