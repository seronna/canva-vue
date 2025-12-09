import { useElementsStore } from '@/stores/elements'
import type { CanvasService } from '@/services/canvas/CanvasService'
import type { GroupElement } from '@/cores/types/element'

export function useRotate(canvasService: CanvasService | null | undefined) {
  const elementsStore = useElementsStore()

  const updateElementRotation = (selectedIds: string[], rotationAngle: number) => {
    let centerX = 0
    let centerY = 0
    
    if (selectedIds.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      
      selectedIds.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (!el) return
        minX = Math.min(minX, el.x)
        minY = Math.min(minY, el.y)
        maxX = Math.max(maxX, el.x + el.width)
        maxY = Math.max(maxY, el.y + el.height)
      })
      
      centerX = (minX + maxX) / 2
      centerY = (minY + maxY) / 2
    }
    
    selectedIds.forEach(id => {
      const el = elementsStore.getElementById(id)
      if (!el) return

      const newRotation = (el.rotation || 0) + rotationAngle
      
      if (selectedIds.length > 1) {
        const elCenterX = el.x + el.width / 2
        const elCenterY = el.y + el.height / 2
        const relX = elCenterX - centerX
        const relY = elCenterY - centerY
        
        const cos = Math.cos(rotationAngle)
        const sin = Math.sin(rotationAngle)
        const newRelX = relX * cos - relY * sin
        const newRelY = relX * sin + relY * cos
        
        const newElCenterX = centerX + newRelX
        const newElCenterY = centerY + newRelY
        const newX = newElCenterX - el.width / 2
        const newY = newElCenterY - el.height / 2
        
        if (el.type === 'image') {
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            imgEl.style.transformOrigin = '50% 50%'
            imgEl.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${newRotation}rad)`
            imgEl.style.width = `${el.width}px`
            imgEl.style.height = `${el.height}px`
          }
        } else if (el.type === 'text') {
          const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (textEl) {
            textEl.style.transformOrigin = '50% 50%'
            textEl.style.transform = `translate3d(${newX}px, ${newY}px, 0) rotate(${newRotation}rad)`
            textEl.style.width = `${el.width}px`
            textEl.style.height = `${el.height}px`
          }
        } else if (el.type === 'group') {
          updateGroupRotation(el, rotationAngle, centerX, centerY)
        } else {
          const graphic = canvasService?.getRenderService().getGraphic(id)
          if (graphic) {
            graphic.pivot.set(el.width / 2, el.height / 2)
            graphic.x = newElCenterX
            graphic.y = newElCenterY
            graphic.rotation = newRotation
          }
        }
      } else {
        if (el.type === 'image') {
          const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (imgEl) {
            imgEl.style.transformOrigin = '50% 50%'
            imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${newRotation}rad)`
            imgEl.style.width = `${el.width}px`
            imgEl.style.height = `${el.height}px`
          }
        } else if (el.type === 'text') {
          const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
          if (textEl) {
            textEl.style.transformOrigin = '50% 50%'
            textEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${newRotation}rad)`
            textEl.style.width = `${el.width}px`
            textEl.style.height = `${el.height}px`
          }
        } else if (el.type === 'group') {
          updateGroupRotation(el, rotationAngle)
        } else {
          const graphic = canvasService?.getRenderService().getGraphic(id)
          if (graphic) {
            graphic.pivot.set(el.width / 2, el.height / 2)
            graphic.x = el.x + el.width / 2
            graphic.y = el.y + el.height / 2
            graphic.rotation = newRotation
          }
        }
      }
    })
  }

  const updateGroupRotation = (groupEl: GroupElement, rotationAngle: number, multiSelectCenterX: number = 0, multiSelectCenterY: number = 0) => {
    const groupCenterX = groupEl.x + groupEl.width / 2
    const groupCenterY = groupEl.y + groupEl.height / 2
    const rotationCenterX = multiSelectCenterX || groupCenterX
    const rotationCenterY = multiSelectCenterY || groupCenterY
    
    groupEl.children?.forEach((childId: string) => {
      const childEl = elementsStore.getElementById(childId)
      if (!childEl) return
      
      const childCenterX = childEl.x + childEl.width / 2
      const childCenterY = childEl.y + childEl.height / 2
      const relX = childCenterX - rotationCenterX
      const relY = childCenterY - rotationCenterY
      
      const cos = Math.cos(rotationAngle)
      const sin = Math.sin(rotationAngle)
      const newRelX = relX * cos - relY * sin
      const newRelY = relX * sin + relY * cos
      
      const newChildCenterX = rotationCenterX + newRelX
      const newChildCenterY = rotationCenterY + newRelY
      const newChildX = newChildCenterX - childEl.width / 2
      const newChildY = newChildCenterY - childEl.height / 2
      
      if (childEl.type === 'image') {
        const imgEl = document.querySelector(`[data-element-id="${childId}"]`) as HTMLElement
        if (imgEl) {
          imgEl.style.transformOrigin = '50% 50%'
          imgEl.style.transform = `translate3d(${newChildX}px, ${newChildY}px, 0) rotate(${(childEl.rotation || 0) + rotationAngle}rad)`
        }
      } else if (childEl.type === 'text') {
        const textEl = document.querySelector(`[data-element-id="${childId}"]`) as HTMLElement
        if (textEl) {
          textEl.style.transformOrigin = '50% 50%'
          textEl.style.transform = `translate3d(${newChildX}px, ${newChildY}px, 0) rotate(${(childEl.rotation || 0) + rotationAngle}rad)`
        }
      } else {
        const graphic = canvasService?.getRenderService().getGraphic(childId)
        if (graphic) {
          graphic.pivot.set(childEl.width / 2, childEl.height / 2)
          graphic.x = newChildCenterX
          graphic.y = newChildCenterY
          graphic.rotation = (childEl.rotation || 0) + rotationAngle
        }
      }
    })
  }

  const applyRotationToStore = (selectedIds: string[], rotationAngle: number) => {
    let centerX = 0
    let centerY = 0
    
    if (selectedIds.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      
      selectedIds.forEach(id => {
        const el = elementsStore.getElementById(id)
        if (!el) return
        minX = Math.min(minX, el.x)
        minY = Math.min(minY, el.y)
        maxX = Math.max(maxX, el.x + el.width)
        maxY = Math.max(maxY, el.y + el.height)
      })
      
      centerX = (minX + maxX) / 2
      centerY = (minY + maxY) / 2
    }
    
    elementsStore.updateElements(selectedIds, (el) => {
      if (el.type === 'group') {
        const groupEl = el as GroupElement
        const groupCenterX = el.x + el.width / 2
        const groupCenterY = el.y + el.height / 2
        
        el.rotation = (el.rotation || 0) + rotationAngle
        
        groupEl.children?.forEach((childId: string) => {
          const childEl = elementsStore.getElementById(childId)
          if (!childEl) return
          
          const childCenterX = childEl.x + childEl.width / 2
          const childCenterY = childEl.y + childEl.height / 2
          const rotationCenterX = selectedIds.length > 1 ? centerX : groupCenterX
          const rotationCenterY = selectedIds.length > 1 ? centerY : groupCenterY
          const relX = childCenterX - rotationCenterX
          const relY = childCenterY - rotationCenterY
          
          const cos = Math.cos(rotationAngle)
          const sin = Math.sin(rotationAngle)
          const newRelX = relX * cos - relY * sin
          const newRelY = relX * sin + relY * cos
          
          const newChildCenterX = rotationCenterX + newRelX
          const newChildCenterY = rotationCenterY + newRelY
          childEl.x = newChildCenterX - childEl.width / 2
          childEl.y = newChildCenterY - childEl.height / 2
          childEl.rotation = (childEl.rotation || 0) + rotationAngle
        })
        
        if (selectedIds.length > 1) {
          const elCenterX = el.x + el.width / 2
          const elCenterY = el.y + el.height / 2
          const relX = elCenterX - centerX
          const relY = elCenterY - centerY
          
          const cos = Math.cos(rotationAngle)
          const sin = Math.sin(rotationAngle)
          const newRelX = relX * cos - relY * sin
          const newRelY = relX * sin + relY * cos
          
          const newElCenterX = centerX + newRelX
          const newElCenterY = centerY + newRelY
          el.x = newElCenterX - el.width / 2
          el.y = newElCenterY - el.height / 2
        }
      } else {
        if (selectedIds.length > 1) {
          const elCenterX = el.x + el.width / 2
          const elCenterY = el.y + el.height / 2
          const relX = elCenterX - centerX
          const relY = elCenterY - centerY
          
          const cos = Math.cos(rotationAngle)
          const sin = Math.sin(rotationAngle)
          const newRelX = relX * cos - relY * sin
          const newRelY = relX * sin + relY * cos
          
          const newElCenterX = centerX + newRelX
          const newElCenterY = centerY + newRelY
          el.x = newElCenterX - el.width / 2
          el.y = newElCenterY - el.height / 2
        }
        
        el.rotation = (el.rotation || 0) + rotationAngle
      }
    })
  }

  const resetElementsToFinalRotation = (selectedIds: string[]) => {
    selectedIds.forEach(id => {
      const el = elementsStore.getElementById(id)
      if (!el) return

      if (el.type === 'image') {
        const imgEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
        if (imgEl) {
          imgEl.style.transformOrigin = '50% 50%'
          imgEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation || 0}rad)`
          imgEl.style.width = `${el.width}px`
          imgEl.style.height = `${el.height}px`
        }
      } else if (el.type === 'text') {
        const textEl = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement
        if (textEl) {
          textEl.style.transformOrigin = '50% 50%'
          textEl.style.transform = `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation || 0}rad)`
          textEl.style.width = `${el.width}px`
          textEl.style.height = `${el.height}px`
        }
      } else if (el.type === 'group') {
        const groupEl = el as GroupElement
        groupEl.children?.forEach((childId: string) => {
          const childEl = elementsStore.getElementById(childId)
          if (!childEl) return
          
          if (childEl.type === 'image') {
            const imgEl = document.querySelector(`[data-element-id="${childId}"]`) as HTMLElement
            if (imgEl) {
              imgEl.style.transformOrigin = '50% 50%'
              imgEl.style.transform = `translate3d(${childEl.x}px, ${childEl.y}px, 0) rotate(${childEl.rotation || 0}rad)`
            }
          } else if (childEl.type === 'text') {
            const textEl = document.querySelector(`[data-element-id="${childId}"]`) as HTMLElement
            if (textEl) {
              textEl.style.transformOrigin = '50% 50%'
              textEl.style.transform = `translate3d(${childEl.x}px, ${childEl.y}px, 0) rotate(${childEl.rotation || 0}rad)`
            }
          } else {
            const graphic = canvasService?.getRenderService().getGraphic(childId)
            if (graphic) {
              graphic.rotation = childEl.rotation || 0
            }
          }
        })
      } else {
        const graphic = canvasService?.getRenderService().getGraphic(id)
        if (graphic) {
          graphic.rotation = el.rotation || 0
        }
      }
    })
  }

  return {
    updateElementRotation,
    applyRotationToStore,
    resetElementsToFinalRotation
  }
}
