use actix_session::Session;
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use maud::html;
use serde::Deserialize;
use urlencoding::encode;

use crate::{auth::is_authenticated, get_redirect_response, page, AppState};

#[get("/week")]
pub async fn get_week(data: web::Data<AppState>) -> impl Responder {
    let data_session_week = data.session_week.lock().unwrap();
    let html = page(html! {
        img src="/assets/logo.jpg" class="logo";
        p {
            "Enter week number:"
        }
        form action="/week" method="POST" {
            input name="week" id="week" value=(format!("{}", data_session_week)) autofocus {}
        }
    });
    HttpResponse::Ok().body(html.into_string())
}

#[derive(Deserialize)]
pub struct WeekForm {
    week: String,
}

#[post("/week")]
pub async fn change_week(
    session: Session,
    data: web::Data<AppState>,
    body: web::Form<WeekForm>,
    req: HttpRequest,
) -> impl Responder {
    if !is_authenticated(&session, &data.authenticated_keys) {
        // Login and redirect back here
        return get_redirect_response(&format!(
            "/login?redirect={}",
            encode(&req.uri().path_and_query().unwrap().to_string()),
        ));
    }
    // Set week
    data.save_session_week(body.week.parse().expect("Input not int"));
    HttpResponse::NoContent().finish()
}
