import Head from "next/head";
import { Fragment } from "react";

const IntroductionPage = () => {
  return (
    <Fragment>
      <Head>
        <title>
          Movie Maven - Discover Everything About Movies and TV Shows
        </title>
        <meta
          name="description"
          content="Discover everything you need to know about your favorite movies and TV shows with Movie Maven. Get detailed information instantly!"
        />
        <link rel="canonical" href="https://movie-maven-bot.vercel.app/" />
        <meta name="robots" content="index, follow" />
        <meta
          property="og:title"
          content="Movie Maven - Discover Everything About Movies and TV Shows"
        />
        <meta
          property="og:description"
          content="Discover everything you need to know about your favorite movies and TV shows with Movie Maven. Get detailed information instantly!"
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://movie-maven-bot.vercel.app/" />

        <meta
          name="twitter:title"
          content="Movie Maven - Discover Everything About Movies and TV Shows"
        />
        <meta
          name="twitter:description"
          content="Discover everything you need to know about your favorite movies and TV shows with Movie Maven. Get detailed information instantly!"
        />
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-full max-w-5xl px-4 py-8 bg-white shadow-lg rounded-lg">
          <h1 className="text-3xl font-semibold text-gray-800">
            Welcome to Movie Maven 🎬
          </h1>
          <p className="mt-4 text-gray-600">
            Discover everything you need to know about your favorite movies and
            TV shows with just a few taps! Movie Maven brings you comprehensive
            and up-to-date information, including:
          </p>
          <ul className="mt-6 text-gray-700">
            <li className="flex items-center space-x-2">
              <span className="text-2xl">&#11088;</span>
              <span>Title</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">📣</span>
              <span>Year of Release</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">🎭</span>
              <span>Cast</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">🗣️</span>
              <span>Language</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">📝</span>
              <span>Description</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">🎥</span>
              <span>IMDb Rating</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">🎞️</span>
              <span>Genre</span>
            </li>
            <li className="flex items-center space-x-2">
              <span className="text-2xl">📺</span>
              <span>Available OTT Platforms</span>
            </li>
          </ul>
          <p className="mt-6 text-gray-600">
            Whether you&apos;re looking for something new to watch or need
            details on a specific title, Movie Maven has got you covered. Start
            exploring the world of entertainment like never before!
          </p>
          <p className="mt-6 text-gray-600">How to use:</p>
          <ol className="list-decimal pl-8 mt-2 text-gray-600">
            <li>Send the name of the movie or TV show.</li>
            <li>Receive detailed information instantly.</li>
          </ol>
          <p className="mt-4 text-gray-600">
            Currently, Movie Maven is available only to users in <b>India.</b>
          </p>
          <br />
          <p className="text-gray-600">
            For feedback and suggestions, please send an email to{" "}
            <a
              className="text-blue-600 hover:underline"
              href="mailto:contact@khalilganiga.in"
            >
              Movie Maven
            </a>
            .
          </p>
          <p className="mt-4 text-gray-600">Happy watching! 🍿</p>
        </div>
      </div>
    </Fragment>
  );
};

export default IntroductionPage;
