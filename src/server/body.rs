use std::task::Poll::Ready;

use hyper::body::Body;
use pin_project_lite::pin_project;

pin_project! {
    pub struct BodyWrapper {
        #[pin]
        pub base: hyper::body::Incoming,
    }
}

impl Body for BodyWrapper {
    type Data = <hyper::body::Incoming as hyper::body::Body>::Data;
    type Error = <hyper::body::Incoming as hyper::body::Body>::Error;

    fn poll_frame(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<hyper::body::Frame<Self::Data>, Self::Error>>> {
        let res = self.project().base.poll_frame(cx);
        if let Ready(Some(Ok(frame))) = &res
            && let Some(bytes) = frame.data_ref()
        {
            eprintln!("read frame: {} bytes", bytes.len())
        }
        res
    }

    fn is_end_stream(&self) -> bool {
        self.base.is_end_stream()
    }

    fn size_hint(&self) -> hyper::body::SizeHint {
        self.base.size_hint()
    }
}
