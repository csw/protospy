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
    expect(page.locator("#detail")).to_contain_text("George Lucas")
    expect(page.locator("#detail")).to_contain_text("1977")


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
    """Clicking Stats loads genre and histogram data into #results."""
    page.goto("/")
    page.locator("nav a", has_text="Stats").click()
    expect(page.locator("#results")).to_contain_text("Action")
    expect(page.locator("#results")).to_contain_text("Adventure")
