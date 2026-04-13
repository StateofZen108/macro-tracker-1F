/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoodForm } from '../../src/components/FoodForm'
import type { FoodDraft } from '../../src/types'

const reviewedDraft: Partial<FoodDraft> = {
  name: 'Greek Yogurt',
  brand: 'Label Scan',
  servingSize: 170,
  servingUnit: 'g',
  calories: 100,
  protein: 17,
  carbs: 6,
  fat: 0,
  fiber: 0,
  barcode: '0123456789012',
}

afterEach(() => {
  cleanup()
})

describe('FoodForm reviewed OCR contract', () => {
  it('submits a reviewed api draft into the food model shape', () => {
    const onSubmit = vi.fn()

    render(
      createElement(FoodForm, {
        title: 'Review imported food',
        submitLabel: 'Save imported food',
        source: 'api',
        initialValues: reviewedDraft,
        onSubmit,
        onCancel: () => undefined,
      }),
    )

    fireEvent.change(screen.getByLabelText('Food name'), {
      target: { value: 'Greek Yogurt (reviewed)' },
    })
    fireEvent.change(screen.getByLabelText(/fiber/i), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save imported food/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Greek Yogurt (reviewed)',
      brand: 'Label Scan',
      servingSize: 170,
      servingUnit: 'g',
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      fiber: 1,
      barcode: '0123456789012',
      source: 'api',
    })
  })

  it('blocks save when a reviewed OCR draft is missing required core fields', () => {
    const onSubmit = vi.fn()

    render(
      createElement(FoodForm, {
        title: 'Review imported food',
        submitLabel: 'Save imported food',
        source: 'api',
        initialValues: {
          ...reviewedDraft,
          calories: undefined,
        },
        onSubmit,
        onCancel: () => undefined,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /save imported food/i }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/calories must be a valid number/i)).toBeInTheDocument()
  })

  it.todo(
    'round-trips OCR-specific reviewed-label metadata through export and import once the food model stores OCR fields',
  )
})
