//! Where a hidden sidebar's card, or a panel of the top bar, stands in
//! physical pixels, and where its shadow lies in a page's own window. Pure, so
//! the Windows stage and the tests share one answer.

use zephium_core::geometry::Rect;
use zephium_core::layout::HIDDEN_CARD_INSET;

/// `(x, y, width, height)` in physical pixels.
pub(crate) type PixelRect = (i32, i32, i32, i32);

/// The card cut to a client area of `client` pixels. Only its top and width
/// are taken as given: the window may have been resized since the card was
/// asked for, so its foot keeps the card's inset from the window's. A card
/// beside the page starts at that inset too; one under a top bar, below it.
pub(crate) fn card_pixels(card: Rect, client: (i32, i32), scale: f64) -> Option<PixelRect> {
    if !scale.is_finite()
        || scale <= 0.0
        || ![card.x, card.y, card.width].iter().all(|v| v.is_finite())
    {
        return None;
    }
    let x = (card.x * scale).round() as i32;
    let y = (card.y * scale).round() as i32;
    let width = ((card.width * scale).round() as i32).min(client.0 - x);
    let height = client.1 - y - (HIDDEN_CARD_INSET * scale).round() as i32;
    (x >= 0 && y >= 0 && width > 0 && height > 0).then_some((x, y, width, height))
}

/// A panel of the top bar cut to a client area of `client` pixels: the rect
/// exactly as given, its own height included, each edge on the nearest pixel
/// and none past the client's.
pub(crate) fn panel_pixels(panel: Rect, client: (i32, i32), scale: f64) -> Option<PixelRect> {
    if !scale.is_finite()
        || scale <= 0.0
        || ![panel.x, panel.y, panel.width, panel.height]
            .iter()
            .all(|v| v.is_finite())
    {
        return None;
    }
    let x = (panel.x * scale).round() as i32;
    let y = (panel.y * scale).round() as i32;
    let right = (((panel.x + panel.width) * scale).round() as i32).min(client.0);
    let bottom = (((panel.y + panel.height) * scale).round() as i32).min(client.1);
    (x >= 0 && y >= 0 && right > x && bottom > y).then_some((x, y, right - x, bottom - y))
}

/// The card's rectangle in the coordinates of a page window placed at
/// `container` in the same space, as `(offset, size)`.
pub(crate) fn in_container(card: PixelRect, container: PixelRect) -> ((i32, i32), (i32, i32)) {
    (
        (card.0 - container.0, card.1 - container.1),
        (card.2, card.3),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_card_scales_with_the_display_and_keeps_its_insets() {
        let card = Rect::new(8.0, 8.0, 256.0, 784.0);
        assert_eq!(card_pixels(card, (1200, 800), 1.0), Some((8, 8, 256, 784)));
        assert_eq!(
            card_pixels(card, (1800, 1200), 1.5),
            Some((12, 12, 384, 1176))
        );
    }

    #[test]
    fn a_resized_window_moves_the_cards_bottom_and_a_narrow_one_trims_it() {
        let card = Rect::new(8.0, 8.0, 256.0, 784.0);
        assert_eq!(card_pixels(card, (1200, 600), 1.0), Some((8, 8, 256, 584)));
        assert_eq!(card_pixels(card, (200, 600), 1.0), Some((8, 8, 192, 584)));
    }

    #[test]
    fn nothing_is_cut_for_a_window_too_small_or_a_card_that_is_not_a_number() {
        let card = Rect::new(8.0, 8.0, 256.0, 784.0);
        assert_eq!(card_pixels(card, (1200, 16), 1.0), None);
        assert_eq!(card_pixels(card, (8, 800), 1.0), None);
        assert_eq!(card_pixels(card, (1200, 800), 0.0), None);
        assert_eq!(
            card_pixels(Rect::new(f64::NAN, 8.0, 256.0, 1.0), (1200, 800), 1.0),
            None
        );
    }

    #[test]
    fn a_card_under_a_top_bar_starts_below_it_and_keeps_its_foot_inset() {
        // The bar is 40 high: the card's top is 48, its foot 8 off the bottom.
        let card = Rect::new(8.0, 48.0, 256.0, 744.0);
        assert_eq!(card_pixels(card, (1200, 800), 1.0), Some((8, 48, 256, 744)));
        assert_eq!(
            card_pixels(card, (1800, 1200), 1.5),
            Some((12, 72, 384, 1116))
        );
        assert_eq!(card_pixels(card, (1200, 600), 1.0), Some((8, 48, 256, 544)));
        assert_eq!(card_pixels(card, (1200, 56), 1.0), None);
    }

    #[test]
    fn a_panel_keeps_its_own_height_and_scales_with_the_display() {
        let panel = Rect::new(300.0, 40.0, 360.0, 420.0);
        assert_eq!(
            panel_pixels(panel, (1200, 800), 1.0),
            Some((300, 40, 360, 420))
        );
        assert_eq!(
            panel_pixels(panel, (1800, 1200), 1.5),
            Some((450, 60, 540, 630))
        );
        // Edges land on the nearest pixel, so a fractional scale neither
        // gaps nor overlaps the bar the panel hangs from.
        assert_eq!(
            panel_pixels(Rect::new(10.5, 40.25, 100.0, 50.5), (1200, 800), 1.25),
            Some((13, 50, 125, 63))
        );
    }

    #[test]
    fn a_panel_is_trimmed_to_the_client_and_nothing_is_cut_for_nonsense() {
        let panel = Rect::new(1000.0, 700.0, 360.0, 420.0);
        assert_eq!(
            panel_pixels(panel, (1200, 800), 1.0),
            Some((1000, 700, 200, 100))
        );
        assert_eq!(
            panel_pixels(Rect::new(1300.0, 40.0, 100.0, 100.0), (1200, 800), 1.0),
            None
        );
        assert_eq!(
            panel_pixels(Rect::new(300.0, 40.0, 0.0, 420.0), (1200, 800), 1.0),
            None
        );
        assert_eq!(
            panel_pixels(Rect::new(300.0, f64::NAN, 360.0, 420.0), (1200, 800), 1.0),
            None
        );
        assert_eq!(
            panel_pixels(
                Rect::new(300.0, 40.0, 360.0, f64::INFINITY),
                (1200, 800),
                1.0
            ),
            None
        );
        assert_eq!(
            panel_pixels(Rect::new(300.0, 40.0, 360.0, 420.0), (1200, 800), 0.0),
            None
        );
    }

    #[test]
    fn the_shadow_lies_where_the_card_does_within_each_page_window() {
        assert_eq!(
            in_container((8, 8, 256, 784), (8, 8, 1184, 784)),
            ((0, 0), (256, 784))
        );
        // A pane further in sees the card start before its own left edge.
        assert_eq!(
            in_container((8, 8, 256, 784), (400, 40, 700, 500)),
            ((-392, -32), (256, 784))
        );
    }
}
