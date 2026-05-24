import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_homepage_loads(page: Page) -> None:
    page.goto("/")
    assert page.title() == "ElasticFlix"


@pytest.mark.e2e
def test_search_via_enter(page: Page) -> None:
    """Typing in the search box and pressing Enter returns results."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_search_via_button(page: Page) -> None:
    """Clicking the Search button returns results."""
    page.goto("/")
    page.locator("#search-input").fill("fistful")
    page.locator("button[type='submit']").click()
    expect(
        page.locator(".movie-card").filter(has_text="A Fistful of Dollars")
    ).to_be_visible()


@pytest.mark.e2e
def test_autocomplete_shows(page: Page) -> None:
    """Typing triggers the suggestion dropdown via HTMX keyup."""
    page.goto("/")
    # type() fires real keyup events, which HTMX's keyup trigger requires
    # "star w" is specific enough that the completion suggester returns "Star Wars" first
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()


@pytest.mark.e2e
def test_autocomplete_click_fills_and_searches(page: Page) -> None:
    """Clicking a suggestion fills the input and triggers a search."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()
    page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True).click()
    expect(page.locator("#search-input")).to_have_value("Star Wars")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_movie_detail(page: Page) -> None:
    """Clicking a movie card loads the detail panel."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    expect(page.locator(".detail-panel")).to_contain_text("1977")


@pytest.mark.e2e
def test_suggestions_dismiss_on_enter(page: Page) -> None:
    """Pressing Enter to submit the search clears the suggestion dropdown."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(page.locator("#suggestions-list li").first).to_be_visible()
    page.keyboard.press("Enter")
    expect(page.locator("#suggestions-list li")).to_have_count(0)


@pytest.mark.e2e
def test_suggestions_dismiss_on_click_outside(page: Page) -> None:
    """Clicking outside the suggestions box clears it."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(page.locator("#suggestions-list li").first).to_be_visible()
    page.locator("h1").click()
    expect(page.locator("#suggestions-list li")).to_have_count(0)


@pytest.mark.e2e
def test_suggestions_escape_dismisses(page: Page) -> None:
    """Pressing Escape clears the suggestion dropdown."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(page.locator("#suggestions-list li").first).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.locator("#suggestions-list li")).to_have_count(0)


@pytest.mark.e2e
def test_suggestions_arrowkey_navigation(page: Page) -> None:
    """Arrow keys highlight suggestions; Enter on a highlighted item selects it."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(page.locator("#suggestions-list li").first).to_be_visible()
    page.keyboard.press("ArrowDown")
    expect(page.locator("#suggestions-list li.highlighted")).to_have_count(1)
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_search_shows_genre_facets(page: Page) -> None:
    """Search results include genre facet chips from the msearch aggregation."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(page.locator(".facet-bar")).to_be_visible()
    expect(page.locator(".facet-chip").first).to_be_visible()


@pytest.mark.e2e
def test_stats_page(page: Page) -> None:
    """Clicking Stats loads genre and histogram data."""
    page.goto("/")
    page.locator("nav a", has_text="Stats").click()
    expect(page.locator(".stats-grid")).to_contain_text("Action")
    expect(page.locator(".stats-grid")).to_contain_text("Adventure")
    assert "/stats" in page.url


@pytest.mark.e2e
def test_movie_detail_shows_more_like_this(page: Page) -> None:
    """Clicking a movie card shows the More Like This panel."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    expect(page.locator(".detail-panel")).to_contain_text("1977")
    expect(page.locator(".similar-panel")).to_be_visible()
    expect(page.locator(".similar-heading")).to_contain_text("More Like This")
    expect(page.locator(".similar-item")).to_have_count(1)


@pytest.mark.e2e
def test_more_like_this_navigation(page: Page) -> None:
    """Clicking a similar item navigates to that movie's page."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    expect(page.locator(".similar-panel")).to_be_visible()
    page.locator(".similar-item").first.click()
    expect(page.locator(".detail-title")).not_to_have_text("Star Wars")
    expect(page.locator(".similar-panel")).to_be_visible()


@pytest.mark.e2e
def test_autocomplete_search_pushes_correct_url(page: Page) -> None:
    """Selecting a suggestion must push /search?q=... (not stay at /) into the URL."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()
    page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True).click()
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    assert "/search" in page.url
    assert "q=" in page.url
    assert "suggest" not in page.url


@pytest.mark.e2e
def test_reload_after_autocomplete_search_restores_results(page: Page) -> None:
    """Reloading after an autocomplete-driven search re-runs the query."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()
    page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True).click()
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.reload()
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_card_after_autocomplete_navigates_to_movie(page: Page) -> None:
    """Card click after autocomplete navigates to /movie/{id}?q=..."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()
    page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True).click()
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_be_visible()
    assert "/movie/" in page.url
    assert "q=" in page.url


@pytest.mark.e2e
def test_reload_after_autocomplete_item_restores_detail(page: Page) -> None:
    """Reloading after autocomplete search + card click restores the detail panel."""
    page.goto("/")
    page.locator("#search-input").type("star w")
    expect(
        page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True)
    ).to_be_visible()
    page.locator("#suggestions-list li").get_by_text("Star Wars", exact=True).click()
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_be_visible()
    page.reload()
    expect(page.locator(".detail-panel")).to_be_visible()


@pytest.mark.e2e
def test_typing_does_not_update_url(page: Page) -> None:
    """Typing must not push the /suggest URL into browser history."""
    page.goto("/")
    initial_url = page.url
    page.locator("#search-input").type("jura")
    page.wait_for_timeout(
        600
    )  # past the 300 ms debounce; let the suggest request settle
    assert page.url == initial_url, (
        f"URL changed while typing: expected {initial_url!r}, got {page.url!r}"
    )


@pytest.mark.e2e
def test_search_pushes_correct_url(page: Page) -> None:
    """Submitting a search pushes /search?q=... and not /suggest?... into the URL."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    # Wait for the URL to change — movie cards are now pre-populated by the
    # top-movies on-load request, so they can't serve as the navigation signal.
    page.wait_for_url("**/search**", timeout=10000)
    expect(page.locator(".movie-card").first).to_be_visible()
    assert "/search" in page.url
    assert "q=" in page.url
    assert "suggest" not in page.url


@pytest.mark.e2e
def test_card_click_navigates_to_movie(page: Page) -> None:
    """Clicking a card navigates to /movie/{id}?q=..."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    assert "/movie/" in page.url
    assert "q=" in page.url


@pytest.mark.e2e
def test_back_button_after_search(page: Page) -> None:
    """Back button after a search returns to the home URL with no results."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    # top-movies cards are pre-loaded, so wait for URL change as the nav signal
    page.wait_for_url("**/search**", timeout=10000)
    expect(page.locator(".movie-card").first).to_be_visible()
    page.go_back()
    # after back, top-movies reload — check URL, not card count
    page.wait_for_url(lambda url: "/search" not in url, timeout=10000)
    assert "/search" not in page.url


@pytest.mark.e2e
def test_back_button_after_item(page: Page) -> None:
    """Back button after selecting a movie returns to the search results page."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    assert "/movie/" in page.url
    page.go_back()
    expect(page.locator(".movie-card").first).to_be_visible()
    assert "/movie/" not in page.url
    assert "/search" in page.url
    assert "q=" in page.url


@pytest.mark.e2e
def test_reload_restores_search(page: Page) -> None:
    """Reloading the page re-runs the search and restores results."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.reload()
    expect(page.locator("#search-input")).to_have_value("star wars")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_reload_restores_item(page: Page) -> None:
    """Reloading after selecting a movie restores the detail panel."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    expect(
        page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    ).to_be_visible()
    page.locator(".movie-card").filter(has_text="Star Wars (1977)").click()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")
    page.reload()
    expect(page.locator(".detail-panel")).to_contain_text("George Lucas")


@pytest.mark.e2e
def test_active_card_highlighted_after_card_click(page: Page) -> None:
    """Clicking a card gives it the .active class; exactly one card is active."""
    page.goto("/")
    page.locator("#search-input").fill("star wars")
    page.keyboard.press("Enter")
    target = page.locator(".movie-card").filter(has_text="Star Wars (1977)")
    expect(target).to_be_visible()
    target.click()
    expect(page.locator(".detail-panel")).to_be_visible()
    expect(page.locator(".movie-card.active")).to_have_count(1)
    expect(
        page.locator(".movie-card.active").filter(has_text="Star Wars (1977)")
    ).to_be_visible()


@pytest.mark.e2e
def test_direct_deep_link_renders_detail_results_and_active_card(
    page: Page,
) -> None:
    """Cold-navigating to /movie/{id}?q=... renders detail panel, results grid, and active card."""
    # Grab a real movie URL from search, then start fresh with a direct goto
    page.goto("/search?q=star+wars")
    first_card = page.locator(".movie-card").first
    expect(first_card).to_be_visible()
    href = first_card.get_attribute("href")
    assert href is not None

    page.goto(href)
    expect(page.locator(".detail-panel")).to_be_visible()
    expect(page.locator(".movie-card").first).to_be_visible()
    expect(page.locator(".movie-card.active")).to_have_count(1)
    assert "/movie/" in page.url
    assert "q=" in page.url
