'use client'

import { Fragment, type ReactNode } from 'react'
import type { ReportBlock, ReportBlockType } from '@/lib/types/database'
import { NUMBERED_BLOCK_TYPES, interpolateReportText } from '@/lib/reports/layout'
import { blobSrc } from '@/lib/blob'
import { SectionHeading } from './report-shell'

/**
 * Context handed to every block renderer. `nextSectionIndex()` yields the next
 * 1-based number for a numbered section — call it ONLY when the section will
 * actually render, so empty sections don't consume a number or leave a gap.
 */
export interface BlockRenderContext {
  block: ReportBlock
  headerColor: string
  vars: Record<string, string>
  nextSectionIndex: () => number
}

export type BlockRenderer = (ctx: BlockRenderContext) => ReactNode
export type ReportBlockRegistry = Partial<Record<ReportBlockType, BlockRenderer>>

const SPACER_HEIGHT: Record<string, string> = {
  sm: 'h-3',
  md: 'h-6',
  lg: 'h-12',
}

/** Renders the built-in custom blocks. Returns undefined for non-custom types. */
function renderCustomBlock(ctx: BlockRenderContext): ReactNode | undefined {
  const { block, headerColor, vars } = ctx
  const props = block.props ?? {}
  switch (block.type) {
    case 'heading': {
      const content = interpolateReportText(String(props.content ?? ''), vars)
      if (!content.trim()) return null
      const level = props.level === 2 ? 2 : 1
      if (level === 2) {
        return (
          <h3
            className="avoid-break mb-2 mt-4 text-sm font-semibold"
            style={{ color: headerColor }}
          >
            {content}
          </h3>
        )
      }
      return (
        <h2
          className="avoid-break mb-3 mt-2 border-b pb-1 text-sm font-bold uppercase tracking-wide"
          style={{ color: headerColor, borderColor: `${headerColor}33` }}
        >
          {content}
        </h2>
      )
    }
    case 'text': {
      const content = interpolateReportText(String(props.content ?? ''), vars)
      if (!content.trim()) return null
      return (
        <p className="avoid-break mb-4 whitespace-pre-wrap text-sm leading-relaxed">
          {content}
        </p>
      )
    }
    case 'image': {
      const src = blobSrc(String(props.imageUrl ?? ''))
      if (!src) return null
      const caption = interpolateReportText(String(props.caption ?? ''), vars)
      return (
        <figure className="avoid-break mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src || '/placeholder.svg'}
            alt={caption || 'Report image'}
            crossOrigin="anonymous"
            className="mx-auto max-h-80 w-auto rounded border object-contain"
          />
          {caption && (
            <figcaption className="mt-1 text-center text-xs text-muted-foreground">
              {caption}
            </figcaption>
          )}
        </figure>
      )
    }
    case 'spacer': {
      const size = String(props.size ?? 'md')
      return <div className={SPACER_HEIGHT[size] ?? SPACER_HEIGHT.md} aria-hidden />
    }
    case 'page_break':
      return <div className="break-before-page" aria-hidden />
    default:
      return undefined
  }
}

/**
 * Renders an ordered report body: custom blocks are drawn here generically; data
 * blocks are dispatched to the caller-supplied `registry` (their data differs by
 * report type). Blocks are pre-filtered to enabled by `resolveLayout`.
 */
export function ReportBlocks({
  blocks,
  registry,
  headerColor,
  vars,
}: {
  blocks: ReportBlock[]
  registry: ReportBlockRegistry
  headerColor: string
  vars: Record<string, string>
}) {
  let sectionCount = 0
  const nextSectionIndex = () => ++sectionCount

  return (
    <>
      {blocks.map((block) => {
        const ctx: BlockRenderContext = { block, headerColor, vars, nextSectionIndex }
        const custom = renderCustomBlock(ctx)
        if (custom !== undefined) {
          return <Fragment key={block.id}>{custom}</Fragment>
        }
        const renderer = registry[block.type]
        return renderer ? <Fragment key={block.id}>{renderer(ctx)}</Fragment> : null
      })}
    </>
  )
}

/** Convenience wrapper so data-section renderers share consistent numbering. */
export function NumberedSection({
  ctx,
  title,
  children,
}: {
  ctx: BlockRenderContext
  title: string
  children: ReactNode
}) {
  const numbered = NUMBERED_BLOCK_TYPES.has(ctx.block.type)
  const index = numbered ? ctx.nextSectionIndex() : undefined
  return (
    <section className="mb-8">
      <SectionHeading index={index} color={ctx.headerColor}>
        {title}
      </SectionHeading>
      {children}
    </section>
  )
}
